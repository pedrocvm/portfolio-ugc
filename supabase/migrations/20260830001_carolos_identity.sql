-- CarolOS 001 | identity, settings and shared helpers.
--
-- Authorization stops being a hard-coded email string scattered through the
-- application and becomes a row: app_user.auth_user_id = auth.uid(). The
-- existing editor is seeded so nothing breaks during the cutover, and the old
-- email policies stay in place until 012 replaces them.

create extension if not exists pgcrypto;

create table if not exists public.app_user (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique,
  role          text not null default 'creator' check (role in ('creator', 'operator')),
  display_name  text not null default '',
  email         text not null default '',
  timezone      text not null default 'Europe/Lisbon',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- security definer so a policy on any table can ask "is this an operator?"
-- without recursively triggering app_user's own policies.
create or replace function public.carolos_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from public.app_user u
  where u.auth_user_id = auth.uid() and u.active
  limit 1
$$;

create or replace function public.is_carolos_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.carolos_user_id() is not null
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_user_touch on public.app_user;
create trigger app_user_touch before update on public.app_user
  for each row execute function public.touch_updated_at();

alter table public.app_user enable row level security;

drop policy if exists "carolos user reads own record" on public.app_user;
create policy "carolos user reads own record" on public.app_user
  for select to authenticated using (auth_user_id = auth.uid());

-- Feature flags and operational configuration. A table rather than env vars so
-- a flag can be flipped without a deploy, and so shadow mode is auditable.
create table if not exists public.app_setting (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text not null default '',
  updated_at  timestamptz not null default now()
);

drop trigger if exists app_setting_touch on public.app_setting;
create trigger app_setting_touch before update on public.app_setting
  for each row execute function public.touch_updated_at();

alter table public.app_setting enable row level security;

drop policy if exists "carolos user manages settings" on public.app_setting;
create policy "carolos user manages settings" on public.app_setting
  for all to authenticated
  using (public.is_carolos_user())
  with check (public.is_carolos_user());

-- Seed: the single existing editor.
insert into public.app_user (auth_user_id, role, display_name, email)
select u.id, 'creator', 'Carol Queiroz', u.email
from auth.users u
where u.email = 'carolxqueiroz@gmail.com'
on conflict (auth_user_id) do nothing;

-- Seed: flags start closed. Nothing automated runs until it is turned on.
insert into public.app_setting (key, value, description) values
  ('flags', jsonb_build_object(
     'gmail_ingestion',      false,
     'ai_enabled',           false,
     'ai_classification',    false,
     'ai_drafting',          false,
     'gmail_draft_creation', false,
     'external_send',        false,
     'auto_apply_low_risk',  false,
     'background_jobs',      false,
     'shadow_mode',          true
   ), 'CarolOS feature flags. shadow_mode observes and recommends without applying state.')
on conflict (key) do nothing;
