-- Pilares de conteúdo gerenciáveis pela Carol.
-- O modelo anterior guardava um enum fixo no próprio card. A partir daqui,
-- os pilares são dados e podem crescer sem novo deploy.

create table if not exists public.content_pillar (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_pillar_name_lower_uidx
  on public.content_pillar (lower(trim(name)));

create index if not exists content_pillar_active_position_idx
  on public.content_pillar (active, position, created_at);

alter table public.content_pillar enable row level security;

grant select, insert, update, delete
  on table public.content_pillar
  to authenticated;

drop policy if exists "carolos user manages content_pillar" on public.content_pillar;
create policy "carolos user manages content_pillar" on public.content_pillar
  for all to authenticated
  using (public.is_carolos_user())
  with check (public.is_carolos_user());

insert into public.content_pillar (name, position)
select seed.name, seed.position
from (
  values
    ('UGC como fonte de renda', 0),
    ('Braga a fundo', 1),
    ('Casa e rotina', 2),
    ('Sobre mim', 3)
) as seed(name, position)
where not exists (
  select 1
  from public.content_pillar p
  where lower(trim(p.name)) = lower(trim(seed.name))
);

alter table public.content_board_item
  add column if not exists pillar_id uuid references public.content_pillar(id) on delete restrict;

update public.content_board_item item
set pillar_id = p.id
from public.content_pillar p
where item.pillar_id is null
  and (
    (item.pillar = 'ugc_income' and p.name = 'UGC como fonte de renda')
    or (item.pillar in ('braga','a_fundo') and p.name = 'Braga a fundo')
    or (item.pillar = 'personal' and p.name = 'Casa e rotina')
  );

alter table public.content_board_item
  alter column pillar drop not null;

create index if not exists content_board_item_pillar_id_idx
  on public.content_board_item (pillar_id);
