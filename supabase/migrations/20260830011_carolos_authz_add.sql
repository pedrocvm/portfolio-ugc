-- CarolOS 011 | authorize by app_user row, not by an email string.
--
-- Additive step: the new policies sit alongside the legacy email ones. Postgres
-- ORs permissive policies together, so access can only widen here, never break.
-- 012 removes the email policies once this one is verified.

do $$
declare t text;
begin
  foreach t in array array['brand', 'document', 'media_item'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;

drop policy if exists "carolos user reads site_content" on public.site_content;
create policy "carolos user reads site_content" on public.site_content
  for select to authenticated using (public.is_carolos_user());

drop policy if exists "carolos user writes site_content" on public.site_content;
create policy "carolos user writes site_content" on public.site_content
  for insert to authenticated with check (public.is_carolos_user());

drop policy if exists "carolos user updates site_content" on public.site_content;
create policy "carolos user updates site_content" on public.site_content
  for update to authenticated
  using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user reads link_event" on public.link_event;
create policy "carolos user reads link_event" on public.link_event
  for select to authenticated using (public.is_carolos_user());

-- Storage: same swap for the media bucket.
drop policy if exists "carolos user uploads media" on storage.objects;
create policy "carolos user uploads media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_carolos_user());

drop policy if exists "carolos user deletes media" on storage.objects;
create policy "carolos user deletes media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_carolos_user());

-- Private bucket for Quick Capture screenshots. Never the public media bucket:
-- a screenshot of a brand conversation must not be reachable by anon.
insert into storage.buckets (id, name, public)
values ('capture', 'capture', false)
on conflict (id) do nothing;

drop policy if exists "carolos user reads captures" on storage.objects;
create policy "carolos user reads captures" on storage.objects
  for select to authenticated
  using (bucket_id = 'capture' and public.is_carolos_user());

drop policy if exists "carolos user writes captures" on storage.objects;
create policy "carolos user writes captures" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capture' and public.is_carolos_user());

drop policy if exists "carolos user removes captures" on storage.objects;
create policy "carolos user removes captures" on storage.objects
  for delete to authenticated
  using (bucket_id = 'capture' and public.is_carolos_user());
