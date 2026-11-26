-- Um lote sintético recuperável por conta. As bases publicadas continuam independentes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('smoov-lotes-simulados', 'smoov-lotes-simulados', false, 5242880, array['application/octet-stream'])
on conflict (id) do nothing;

create table public.saved_synthetic_batches (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null,
  file_name text not null check (length(file_name) between 6 and 255 and file_name ~* '[.]xlsx$'),
  file_size integer not null check (file_size between 22 and 367001600),
  saved_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.saved_synthetic_batches enable row level security;
revoke all on public.saved_synthetic_batches from public, anon, authenticated;
grant select, insert, update on public.saved_synthetic_batches to authenticated;

create policy saved_synthetic_batches_owner on public.saved_synthetic_batches
for all to authenticated
using (user_id = (select auth.uid()) and private.has_role(org_id, 'smoov_admin'))
with check (user_id = (select auth.uid()) and private.has_role(org_id, 'smoov_admin'));

create function private.is_synthetic_batch_owner(object_name text)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select case when object_name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9]{3}[.]part$'
    then split_part(object_name, '/', 2) = (select auth.uid())::text
     and private.has_role(split_part(object_name, '/', 1)::uuid, 'smoov_admin')
    else false end;
$$;

revoke all on function private.is_synthetic_batch_owner(text) from public;
grant execute on function private.is_synthetic_batch_owner(text) to authenticated;

create policy smoov_synthetic_parts_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'smoov-lotes-simulados' and private.is_synthetic_batch_owner(name)
);

create policy smoov_synthetic_parts_select on storage.objects
for select to authenticated using (
  bucket_id = 'smoov-lotes-simulados' and private.is_synthetic_batch_owner(name)
);

create policy smoov_synthetic_parts_delete_inactive on storage.objects
for delete to authenticated using (
  bucket_id = 'smoov-lotes-simulados' and private.is_synthetic_batch_owner(name)
  and not exists (
    select 1 from public.saved_synthetic_batches b
    where b.org_id::text = split_part(storage.objects.name, '/', 1)
      and b.user_id = (select auth.uid())
      and b.upload_id::text = split_part(storage.objects.name, '/', 3)
  )
);

create function private.require_complete_synthetic_batch()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  part_size constant integer := 5242880;
  parts integer := (new.file_size + part_size - 1) / part_size;
  prefix text := new.org_id || '/' || new.user_id || '/' || new.upload_id || '/';
begin
  if new.file_size is null or new.file_size not between 22 and 367001600 then
    raise exception 'Tamanho do lote inválido.';
  end if;
  if exists (
    select 1
    from generate_series(0, parts - 1) as expected(i)
    where not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'smoov-lotes-simulados'
         and o.name = prefix || lpad(expected.i::text, 3, '0') || '.part'
         and o.metadata->>'size' = least(part_size, new.file_size - expected.i * part_size)::text
    )
  ) then
    raise exception 'O Excel ainda não foi enviado por completo.';
  end if;
  return new;
end;
$$;

revoke all on function private.require_complete_synthetic_batch() from public;
grant execute on function private.require_complete_synthetic_batch() to authenticated;

create trigger require_complete_synthetic_batch
before insert or update on public.saved_synthetic_batches
for each row execute function private.require_complete_synthetic_batch();

create function public.save_synthetic_batch(p_org uuid, p_upload uuid, p_file_name text, p_file_size integer)
returns table (old_upload uuid, old_size integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.has_role(p_org, 'smoov_admin') then
    raise exception 'Acesso restrito ao administrador Smoov.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || '/' || uid::text, 0));
  select b.upload_id, b.file_size into old_upload, old_size
    from public.saved_synthetic_batches b where b.org_id = p_org and b.user_id = uid;
  insert into public.saved_synthetic_batches (org_id, user_id, upload_id, file_name, file_size)
    values (p_org, uid, p_upload, p_file_name, p_file_size)
    on conflict (org_id, user_id) do update set upload_id = excluded.upload_id,
      file_name = excluded.file_name, file_size = excluded.file_size, saved_at = now();
  return next;
end;
$$;

revoke all on function public.save_synthetic_batch(uuid, uuid, text, integer) from public, anon;
grant execute on function public.save_synthetic_batch(uuid, uuid, text, integer) to authenticated;
