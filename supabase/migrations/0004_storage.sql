-- ============================================================================
-- 0004_storage.sql — private buckets & storage policies (spec §7.3)
--
-- Path convention: {organization_id}/{client_account_id}/{entity_id}/{filename}
-- Buckets are PRIVATE: access only via signed URLs; policies double-check
-- client access so knowing a path alone is not enough to read a file.
-- storage_client_id() (0002_rls.sql) returns NULL for non-conforming paths,
-- and has_client_access(NULL) is false → policies fail closed.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('research-files', 'research-files', false),
  ('listing-assets', 'listing-assets', false),
  ('supplier-documents', 'supplier-documents', false),
  ('reports', 'reports', false),
  ('customer-attachments', 'customer-attachments', false)
on conflict (id) do nothing;

create policy "research files read" on storage.objects
  for select using (
    bucket_id = 'research-files'
    and public.has_client_access(public.storage_client_id(name))
  );

create policy "research files write" on storage.objects
  for all using (
    bucket_id = 'research-files'
    and public.has_client_access(public.storage_client_id(name))
  ) with check (
    bucket_id = 'research-files'
    and public.has_client_access(public.storage_client_id(name))
  );

create policy "listing assets access" on storage.objects
  for all using (
    bucket_id = 'listing-assets'
    and public.has_client_access(public.storage_client_id(name))
  ) with check (
    bucket_id = 'listing-assets'
    and public.has_client_access(public.storage_client_id(name))
  );

create policy "supplier documents access" on storage.objects
  for all using (
    bucket_id = 'supplier-documents'
    and public.has_client_access(public.storage_client_id(name))
  ) with check (
    bucket_id = 'supplier-documents'
    and public.has_client_access(public.storage_client_id(name))
  );

create policy "reports access" on storage.objects
  for all using (
    bucket_id = 'reports'
    and public.has_client_access(public.storage_client_id(name))
  ) with check (
    bucket_id = 'reports'
    and public.has_client_access(public.storage_client_id(name))
  );

-- Customer attachments carry PII risk: CS/AM/admin/owner/reviewer only
create policy "customer attachments access" on storage.objects
  for all using (
    bucket_id = 'customer-attachments'
    and public.has_client_access(public.storage_client_id(name))
    and public.get_org_role(
      (select organization_id from public.client_accounts
        where id = public.storage_client_id(name))
    ) in ('owner', 'admin', 'customer_service', 'account_manager', 'reviewer')
  ) with check (
    bucket_id = 'customer-attachments'
    and public.has_client_access(public.storage_client_id(name))
    and public.get_org_role(
      (select organization_id from public.client_accounts
        where id = public.storage_client_id(name))
    ) in ('owner', 'admin', 'customer_service', 'account_manager', 'reviewer')
  );
