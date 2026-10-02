-- CarolOS simples.
-- O conteúdo volta a ser um gerenciador manual. Sem geração, sem análise,
-- sem automações e sem dependências de IA. A mesma linha alimenta o calendário
-- semanal e o Kanban diário.

create table if not exists public.content_board_item (
  id            uuid primary key default gen_random_uuid(),
  pillar        text not null check (pillar in ('ugc_income','braga','a_fundo','personal')),
  format        text not null default '',
  subject       text not null,
  script        text not null default '',
  scheduled_for date not null default current_date,
  stage         text not null default 'idea'
    check (stage in ('idea','script','recording','editing','ready','published')),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists content_board_item_schedule_idx
  on public.content_board_item (scheduled_for, stage, position, created_at);

alter table public.content_board_item enable row level security;

drop policy if exists "carolos user manages content_board_item" on public.content_board_item;
create policy "carolos user manages content_board_item" on public.content_board_item
  for all to authenticated
  using (public.is_carolos_user())
  with check (public.is_carolos_user());

-- A nova fase é manual. Nada do conteúdo precisa continuar rodando em cron.
do $$
declare
  j record;
begin
  for j in
    select jobname
    from cron.job
    where jobname like 'carolos-%'
  loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;
