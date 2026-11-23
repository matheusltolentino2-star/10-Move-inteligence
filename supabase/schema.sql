-- =============================================================================
-- 10 Move Intelligence — esquema do Supabase
-- -----------------------------------------------------------------------------
-- APLICADO em 23/11/2026 no projeto 10-move-intelligence (sa-east-1).
-- Este arquivo é o estado real do banco, não um rascunho.
--
-- Princípio: o servidor NUNCA recebe registros individuais de clientes.
-- A planilha continua sendo lida no navegador. O que sobe para o banco são
-- apenas (a) quem pode acessar o quê e (b) indicadores agregados já aprovados.
--
-- Para recriar em outro projeto: SQL Editor → cole → Run. Tudo é idempotente.
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. Organizações e papéis
-- =============================================================================

do $$ begin
  create type public.app_role as enum ('smoov_admin', 'tenmove_team', 'tech_admin');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx  on public.memberships(org_id);

-- =============================================================================
-- 2. Funções auxiliares em schema PRIVADO
--    Precisam ser SECURITY DEFINER para as políticas de RLS não entrarem em
--    recursão ao consultar memberships. Ficam fora de `public` porque o
--    PostgREST expõe como endpoint /rest/v1/rpc/ tudo que está em `public` —
--    o linter de segurança do Supabase aponta isso corretamente.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_org_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

create or replace function private.has_role(target_org uuid, needed public.app_role)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org and role = needed
  );
$$;

create or replace function private.is_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships where user_id = auth.uid() and org_id = target_org
  );
$$;

-- =============================================================================
-- 3. Indicadores aprovados para compartilhamento
--    Espelha o catálogo de MI.privacy.INDICATORS no cliente.
-- =============================================================================

create table if not exists public.approved_indicators (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  indicator_id  text not null,
  approved      boolean not null default false,
  k_threshold   integer not null default 30 check (k_threshold >= 2),
  approved_by   uuid references auth.users(id),
  approved_at   timestamptz not null default now(),
  unique (org_id, indicator_id)
);

-- =============================================================================
-- 4. Agregados publicados
--    `payload` guarda SOMENTE números agregados. As constraints abaixo
--    bloqueiam, no banco, a publicação de grupo pequeno.
-- =============================================================================

create table if not exists public.published_aggregates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  indicator_id  text not null,
  scope_label   text not null,
  scope_hash    text not null,
  min_group_n   integer not null,
  k_threshold   integer not null,
  row_count     integer not null,
  payload       jsonb not null,
  published_by  uuid references auth.users(id),
  published_at  timestamptz not null default now(),
  constraint grupo_minimo_respeitado check (min_group_n >= k_threshold),
  constraint recorte_nao_minusculo   check (row_count >= k_threshold)
);

create index if not exists pub_agg_org_idx on public.published_aggregates(org_id, indicator_id);

-- Proteção contra reconstrução por consultas sucessivas: limita quantos
-- recortes diferentes do mesmo indicador podem ser publicados por dia.
create or replace function private.limitar_recortes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare qtd integer;
begin
  select count(distinct scope_hash) into qtd
    from public.published_aggregates
   where org_id = new.org_id
     and indicator_id = new.indicator_id
     and published_at > now() - interval '1 day';
  if qtd >= 20 then
    raise exception 'Limite de recortes diarios atingido para o indicador % (protecao contra reconstrucao por diferenciacao).', new.indicator_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_limitar_recortes on public.published_aggregates;
create trigger trg_limitar_recortes
  before insert on public.published_aggregates
  for each row execute function private.limitar_recortes();

-- =============================================================================
-- 5. Auditoria (append-only)
-- =============================================================================

create table if not exists public.audit_log (
  id         bigserial primary key,
  org_id     uuid references public.organizations(id) on delete set null,
  user_id    uuid references auth.users(id) on delete set null,
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_org_idx on public.audit_log(org_id, created_at desc);

-- =============================================================================
-- 6. Row Level Security — negar por padrão
-- =============================================================================

alter table public.organizations        enable row level security;
alter table public.memberships          enable row level security;
alter table public.approved_indicators  enable row level security;
alter table public.published_aggregates enable row level security;
alter table public.audit_log            enable row level security;

alter table public.organizations        force row level security;
alter table public.memberships          force row level security;
alter table public.approved_indicators  force row level security;
alter table public.published_aggregates force row level security;
alter table public.audit_log            force row level security;

-- Organizações: só as suas.
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select to authenticated using (id in (select private.current_org_ids()));

-- Vínculos: cada um vê os da própria organização; só o admin Smoov altera.
drop policy if exists mem_select on public.memberships;
create policy mem_select on public.memberships
  for select to authenticated using (org_id in (select private.current_org_ids()));

drop policy if exists mem_write on public.memberships;
create policy mem_write on public.memberships
  for all to authenticated using (private.has_role(org_id, 'smoov_admin'))
  with check (private.has_role(org_id, 'smoov_admin'));

-- Indicadores aprovados: todos os membros leem; só o admin Smoov aprova.
drop policy if exists ind_select on public.approved_indicators;
create policy ind_select on public.approved_indicators
  for select to authenticated using (private.is_member(org_id));

drop policy if exists ind_write on public.approved_indicators;
create policy ind_write on public.approved_indicators
  for all to authenticated using (private.has_role(org_id, 'smoov_admin'))
  with check (private.has_role(org_id, 'smoov_admin'));

-- Agregados publicados:
--  · admin Smoov e técnico veem tudo da organização;
--  · a equipe 10 Move vê apenas o que está aprovado;
--  · somente o admin Smoov publica, e só indicador aprovado com k compatível.
drop policy if exists agg_select on public.published_aggregates;
create policy agg_select on public.published_aggregates
  for select to authenticated using (
    private.is_member(org_id) and (
      private.has_role(org_id, 'smoov_admin')
      or private.has_role(org_id, 'tech_admin')
      or exists (
        select 1 from public.approved_indicators ai
        where ai.org_id = published_aggregates.org_id
          and ai.indicator_id = published_aggregates.indicator_id
          and ai.approved
      )
    )
  );

drop policy if exists agg_insert on public.published_aggregates;
create policy agg_insert on public.published_aggregates
  for insert to authenticated with check (
    private.has_role(org_id, 'smoov_admin')
    and exists (
      select 1 from public.approved_indicators ai
      where ai.org_id = published_aggregates.org_id
        and ai.indicator_id = published_aggregates.indicator_id
        and ai.approved
        and published_aggregates.k_threshold >= ai.k_threshold
    )
  );

drop policy if exists agg_delete on public.published_aggregates;
create policy agg_delete on public.published_aggregates
  for delete to authenticated using (private.has_role(org_id, 'smoov_admin'));

-- Auditoria: leitura para admin Smoov e técnico; inserção por qualquer membro
-- em seu próprio nome; ninguém atualiza nem apaga.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (
    private.has_role(org_id, 'smoov_admin') or private.has_role(org_id, 'tech_admin')
  );

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to authenticated with check (private.is_member(org_id) and user_id = auth.uid());

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- =============================================================================
-- 7. Organização inicial (já criada no projeto)
-- =============================================================================

insert into public.organizations (slug, name)
  values ('smoov', 'Smoov')
  on conflict (slug) do nothing;

-- =============================================================================
-- 8. Vincular usuários — FALTA FAZER
--    Crie cada pessoa em Authentication → Users, copie o UUID e rode:
--
--    insert into public.memberships (org_id, user_id, role)
--      select o.id, 'UUID-DO-USUARIO', 'smoov_admin'
--        from public.organizations o where o.slug = 'smoov'
--      on conflict (org_id, user_id) do update set role = excluded.role;
--
--    Papéis: 'smoov_admin' | 'tenmove_team' | 'tech_admin'
--    Sem vínculo, o login funciona mas nenhuma seção abre — é o
--    comportamento correto de negar por padrão.
-- =============================================================================
