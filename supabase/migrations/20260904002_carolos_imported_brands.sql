-- «Já tenho marcas»: a Carol cola a lista que separou, e o CarolOS pesquisa
-- aquelas entidades.
--
-- Não nasce tabela nova. Um lote importado é uma `outreach_run` com
-- `kind = 'imported'`, e cada linha colada é uma `outreach_candidate` — as duas
-- já são exatamente isto: uma corrida e as marcas que dela saíram. Um
-- `imported_brand_batch` paralelo obrigaria a duplicar a revisão, o envio, o
-- histórico e as referências, que já sabem trabalhar sobre estas duas.
--
-- O que é mesmo novo é a proveniência (que linha deu origem a que marca), a
-- classificação de relação (nova, já abordada, cliente, suprimida) e a honestidade
-- sobre o que não se conseguiu verificar.

-- ── Vários lotes no mesmo dia ────────────────────────────────────────────────
-- `unique (app_user_id, run_date, kind)` deixava correr uma busca dirigida por
-- dia: a segunda era recusada pelo Postgres e a tela dizia «Não consegui começar
-- a procura» sem saber porquê. A idempotência que interessa é só a da corrida
-- diária — essa é a que o cron pode disparar duas vezes.
--
-- Em produção isto já estava resolvido por uma migração aplicada pela MCP sem
-- ficheiro; o índice tem o nome de lá de propósito, para o `if not exists` o
-- reconhecer em vez de criar um segundo igual. Numa base do zero é aqui que
-- nasce.
alter table public.outreach_run
  drop constraint if exists outreach_run_app_user_id_run_date_kind_key;

create unique index if not exists outreach_run_daily_once_idx
  on public.outreach_run (app_user_id, run_date)
  where kind = 'daily';

alter table public.outreach_run drop constraint if exists outreach_run_kind_check;
alter table public.outreach_run add constraint outreach_run_kind_check
  check (kind in ('daily', 'manual', 'targeted', 'imported'));

alter table public.outreach_run
  add column if not exists source     text,
  -- O texto tal como ela o colou. É a prova de que se analisou o que ela pediu
  -- e não outra coisa.
  add column if not exists raw_input  text,
  -- Idempotência do lote: colar a mesma lista duas vezes seguidas não abre
  -- duas corridas nem paga duas vezes a pesquisa.
  add column if not exists input_hash text,
  add column if not exists total      integer not null default 0,
  add column if not exists processed  integer not null default 0;

comment on column public.outreach_run.source is
  'MANUAL_LIST quando as marcas vieram de uma lista colada por ela.';
comment on column public.outreach_run.processed is
  'Quantas já foram tratadas. É daqui que sai «pesquisando 6 de 10» — nunca de uma percentagem inventada.';

create index if not exists outreach_run_input_hash_idx
  on public.outreach_run (input_hash) where input_hash is not null;

-- ── A candidata sabe de que linha veio e o que já se sabia dela ──────────────
alter table public.outreach_candidate
  add column if not exists raw_input      text,
  -- O parse da linha: tipo de entrada, nome, domínio, @, pistas de local.
  add column if not exists import_input   jsonb,
  -- Domínio, @ ou nome normalizado. É a chave que impede a mesma marca de
  -- entrar duas vezes no mesmo lote.
  add column if not exists import_key     text,
  -- Escolhida por ela ganha a qualquer régua de encaixe: o fit score ordena,
  -- não veta.
  add column if not exists user_selected  boolean not null default false,
  add column if not exists resolution     text check (resolution in (
    'NEW_COLD', 'ALREADY_IN_CRM_NOT_CONTACTED', 'ALREADY_CONTACTED', 'WAITING_REPLY',
    'NURTURE', 'REENGAGE', 'ACTIVE_NEGOTIATION', 'CLIENT', 'SUPPRESSED', 'IDENTITY_UNCERTAIN'
  )),
  add column if not exists resolution_note text,
  add column if not exists resolution_evidence jsonb not null default '[]'::jsonb,
  -- Falso quando o Gmail não respondeu. Não se afirma que uma marca é nova sem
  -- ter podido perguntar.
  add column if not exists dedup_complete boolean not null default true,
  add column if not exists identity_confidence text
    check (identity_confidence in ('high', 'medium', 'low')),
  add column if not exists identity_evidence jsonb not null default '[]'::jsonb,
  -- Enriquecimento por categoria. Hotelaria é o primeiro: quartos, spa, mesa,
  -- vinho, estação — o que decide que EXPERIÊNCIA há para gravar.
  add column if not exists category_profile jsonb;

comment on column public.outreach_candidate.user_selected is
  'A Carol escolheu esta marca. O encaixe comercial descreve, nunca exclui.';
comment on column public.outreach_candidate.dedup_complete is
  'Falso = não foi possível confirmar no Gmail. A abordagem sai com aviso.';
comment on column public.outreach_candidate.import_key is
  'Identificador do lote: domínio, @ ou nome normalizado. Nunca parecença de nome.';

-- A mesma marca não entra duas vezes no mesmo lote, nem quando o lote é
-- recomeçado a meio.
create unique index if not exists outreach_candidate_import_uniq
  on public.outreach_candidate (run_id, import_key)
  where import_key is not null;

create index if not exists outreach_candidate_resolution_idx
  on public.outreach_candidate (resolution) where resolution is not null;
