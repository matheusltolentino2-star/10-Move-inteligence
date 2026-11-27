-- Padrão organizacional somente para o arquivo sintético conferido.
create table public.organization_default_batches (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  owner_id uuid not null,
  upload_id uuid not null,
  file_name text not null,
  file_size integer not null check (file_size between 22 and 367001600),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$')
);

alter table public.organization_default_batches enable row level security;
revoke all on public.organization_default_batches from public, anon, authenticated;
grant select on public.organization_default_batches to authenticated;

create policy organization_default_batch_members on public.organization_default_batches
for select to authenticated using (private.is_member(org_id));

do $$
declare
  saved public.saved_synthetic_batches%rowtype;
  hashes text[];
  bytes bigint;
  esperado constant text[] := array[
    '493bcafcb2327a8fc96d9278fe1a8ac4','60285842321051f30bb0afc6df17accb',
    '9522b90544c44a27a4869eda6fa6a65e','fa0cb2158ba19a0ea9696a41da098592',
    '5a9afed11cdab3597804cc2773946b87','46774ebf3b77d9d32f99a45b38d0f666',
    '21f0385415800720cc4b383e355fffa1','5d6cb0fa661c23876b333c84a8d8035e',
    'a85e3c5ec496d30f066b4e77f17df01a','b73b2583f753e29b1cc5dc07a0c2b220',
    '7d25e990f9fccc8519700b99bf3558f7','f533323a54c801a2d078c5437cdcb709',
    '0ec60cb9c513650ccbbb1bab9e9bd69c','9016cfbd27e78662830e271b6869d3ee',
    'a5833e70d356d40a92d0d69521d25ef1','7e016fb22d701ef32df1e8a9f0e09e5b'
  ];
begin
  select b.* into strict saved
  from public.saved_synthetic_batches b join public.organizations o on o.id=b.org_id
  where o.slug='smoov' and b.file_name='SMOOV_INTELLIGENCE_FULL_DATASET.xlsx' and b.file_size=83759388
  for update of b;
  select array_agg(trim(both '"' from ob.metadata->>'eTag') order by ob.name),
         sum((ob.metadata->>'size')::bigint)
    into hashes, bytes
    from storage.objects ob
    where ob.bucket_id='smoov-lotes-simulados'
      and ob.name like saved.org_id||'/'||saved.user_id||'/'||saved.upload_id||'/%';
  if hashes is distinct from esperado or bytes is distinct from saved.file_size::bigint then
    raise exception 'Os blocos do lote salvo divergem do Excel sintético homologado.';
  end if;
  insert into public.organization_default_batches(org_id, owner_id, upload_id, file_name, file_size, sha256)
  values (saved.org_id, saved.user_id, saved.upload_id, saved.file_name, saved.file_size,
          '779ecd9b22aafee2f4feb7ae0ab9e05287993705647fad802fc8486fb46a1f59');
end;
$$;

create policy smoov_synthetic_parts_org_default on storage.objects
for select to authenticated using (
  bucket_id = 'smoov-lotes-simulados'
  and exists (select 1 from public.organization_default_batches d where
    d.org_id::text = split_part(storage.objects.name, '/', 1)
    and d.owner_id::text = split_part(storage.objects.name, '/', 2)
    and d.upload_id::text = split_part(storage.objects.name, '/', 3))
);

drop policy smoov_synthetic_parts_delete_inactive on storage.objects;
create policy smoov_synthetic_parts_delete_inactive on storage.objects
for delete to authenticated using (
  bucket_id = 'smoov-lotes-simulados' and private.is_synthetic_batch_owner(name)
  and not exists (
    select 1 from public.saved_synthetic_batches b
    where b.org_id::text = split_part(storage.objects.name, '/', 1)
      and b.user_id = (select auth.uid())
      and b.upload_id::text = split_part(storage.objects.name, '/', 3)
  )
  and not exists (select 1 from public.organization_default_batches d where
    d.org_id::text = split_part(storage.objects.name, '/', 1)
    and d.owner_id::text = split_part(storage.objects.name, '/', 2)
    and d.upload_id::text = split_part(storage.objects.name, '/', 3))
);
