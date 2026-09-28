-- CarolOS Content Strategy v1
--
-- Recomeça a área privada pelo que a Carol realmente usa agora. As tabelas
-- antigas permanecem intactas como histórico; deixam de comandar a interface
-- e os jobs antigos deixam de correr. Esta migração é somente aditiva.

create table if not exists public.editorial_pillar (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  key          text not null check (key in ('ugc_income','experiences','home')),
  name         text not null,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (app_user_id, key)
);

create table if not exists public.editorial_topic (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  pillar_id     uuid not null references public.editorial_pillar (id) on delete cascade,
  key           text not null,
  name          text not null,
  state         text not null default 'now' check (state in ('now','next','later','paused')),
  focus_weight  integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (app_user_id, key)
);

create index if not exists editorial_topic_state_idx
  on public.editorial_topic (app_user_id, state, pillar_id)
  where active = true;

create table if not exists public.editorial_current_focus (
  id                uuid primary key default gen_random_uuid(),
  app_user_id       uuid not null references public.app_user (id) on delete cascade,
  title             text not null,
  summary           text not null,
  commercial_focus  text not null,
  starts_on         date not null default current_date,
  ends_on           date,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists editorial_current_focus_one_active_idx
  on public.editorial_current_focus (app_user_id)
  where active = true;

create table if not exists public.editorial_week_plan (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references public.app_user (id) on delete cascade,
  week_start      date not null,
  status          text not null default 'active' check (status in ('draft','active','closed')),
  summary         text not null default '',
  source_version  text not null default 'CAROL_CONTENT_SOT_V1',
  generated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (app_user_id, week_start)
);

create table if not exists public.editorial_piece (
  id                   uuid primary key default gen_random_uuid(),
  app_user_id          uuid not null references public.app_user (id) on delete cascade,
  week_plan_id         uuid not null references public.editorial_week_plan (id) on delete cascade,
  slot_order           integer not null default 0,
  pillar_id            uuid references public.editorial_pillar (id) on delete set null,
  topic_id             uuid references public.editorial_topic (id) on delete set null,
  topic_name           text not null,
  pillar_key           text not null check (pillar_key in ('ugc_income','experiences','home')),
  angle                text not null,
  lens                 text not null check (lens in ('who_i_am','how_i_think','what_i_do')),
  objective            text not null check (objective in ('attract','retain','prove','convert')),
  platform_format      text not null check (platform_format in ('reel','carousel','photo_sequence')),
  structure            text not null default '',
  commercial_modality  text not null default 'non_commercial'
                         check (commercial_modality in ('tech_ugc','canvas_ugc','non_commercial')),
  why_now              text not null,
  status               text not null default 'proposed'
                         check (status in ('proposed','approved_for_development','to_validate',
                                           'ready_to_produce','in_production','published',
                                           'in_analysis','learning_recorded','rejected')),
  adjustment_notes     text not null default '',
  decision_trace       jsonb not null default '{}'::jsonb,
  approved_at          timestamptz,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (week_plan_id, slot_order)
);

create index if not exists editorial_piece_recent_idx
  on public.editorial_piece (app_user_id, created_at desc);
create index if not exists editorial_piece_status_idx
  on public.editorial_piece (app_user_id, status, created_at desc);

drop trigger if exists editorial_pillar_touch on public.editorial_pillar;
create trigger editorial_pillar_touch before update on public.editorial_pillar
  for each row execute function public.touch_updated_at();
drop trigger if exists editorial_topic_touch on public.editorial_topic;
create trigger editorial_topic_touch before update on public.editorial_topic
  for each row execute function public.touch_updated_at();
drop trigger if exists editorial_current_focus_touch on public.editorial_current_focus;
create trigger editorial_current_focus_touch before update on public.editorial_current_focus
  for each row execute function public.touch_updated_at();
drop trigger if exists editorial_week_plan_touch on public.editorial_week_plan;
create trigger editorial_week_plan_touch before update on public.editorial_week_plan
  for each row execute function public.touch_updated_at();
drop trigger if exists editorial_piece_touch on public.editorial_piece;
create trigger editorial_piece_touch before update on public.editorial_piece
  for each row execute function public.touch_updated_at();

alter table public.editorial_pillar enable row level security;
alter table public.editorial_topic enable row level security;
alter table public.editorial_current_focus enable row level security;
alter table public.editorial_week_plan enable row level security;
alter table public.editorial_piece enable row level security;

create policy "carolos user manages editorial_pillar" on public.editorial_pillar
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
create policy "carolos user manages editorial_topic" on public.editorial_topic
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
create policy "carolos user manages editorial_current_focus" on public.editorial_current_focus
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
create policy "carolos user manages editorial_week_plan" on public.editorial_week_plan
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
create policy "carolos user manages editorial_piece" on public.editorial_piece
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

-- CRM, Gmail, prospecção, manhã automática, receita e demais jobs antigos
-- deixam de correr. Preservamos somente a captura do Instagram e renovação do
-- token para não perder histórico que poderá alimentar a Auditoria depois.
do $$
declare r record;
begin
  for r in
    select jobname from cron.job
    where jobname like 'carolos-%'
      and jobname not in ('carolos-instagram-sync', 'carolos-instagram-token')
  loop
    perform cron.unschedule(r.jobname);
  end loop;
exception when undefined_table then
  null;
end $$;

create or replace function public.carolos_apply_schedule()
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = public, cron, extensions
as $$
begin
  perform cron.unschedule('carolos-instagram-sync')
    where exists (select 1 from cron.job j where j.jobname = 'carolos-instagram-sync');
  perform cron.unschedule('carolos-instagram-token')
    where exists (select 1 from cron.job j where j.jobname = 'carolos-instagram-token');

  perform cron.schedule('carolos-instagram-sync', '*/30 * * * *',
    'select public.carolos_dispatch_job(''instagram-sync'')');
  perform cron.schedule('carolos-instagram-token', '2 6 * * *',
    'select public.carolos_dispatch_job(''instagram-token'')');

  return query
    select j.jobname::text, j.schedule::text
    from cron.job j
    where j.jobname in ('carolos-instagram-sync', 'carolos-instagram-token')
    order by j.jobname;
end;
$$;

revoke execute on function public.carolos_apply_schedule() from anon, authenticated, public;
