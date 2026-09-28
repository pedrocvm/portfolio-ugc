-- CarolOS · Estratégia de conteúdo (Source of Truth v1.0, 28/09/2026)
--
-- O que muda: a área de Conteúdo deixa de escolher entre histórias já
-- guardadas e passa a propor o que vale publicar agora, com a razão à vista.
--
-- Seis decisões que o schema faz cumprir, não só o código:
--
-- 1. **Pilar é território, não função.** Os quatro «pilares funcionais» de
--    `20260905001` eram objetivos disfarçados. Ficam como
--    `legacy_functional_pillar` e o objetivo editorial nasce deles por
--    mapeamento marcado como inferido. Nada é apagado.
-- 2. **Modalidade comercial não é formato.** `commercial_modality` é coluna
--    própria com `check` próprio. Um Tech UGC pode ser Reel; guardar «Tech
--    UGC» em `format` tornaria a pergunta «que formato funciona» insolúvel.
-- 3. **Proposta sem evidência não existe.** `content_proposal.evidence` tem
--    `check` que recusa array vazio. «Por que agora» deriva dali.
-- 4. **Roteiro não salta a pessoa.** `check` recusa `ready_to_produce` sem
--    `validated_at`, e `published` sem ter passado por validação.
-- 5. **Assunto pausado não é assunto apagado.** `content_topic.state` muda e
--    `content_topic_event` guarda a mudança.
-- 6. **Zero continua diferente de indisponível.** Nenhuma coluna métrica nova
--    tem `default 0`; o desconhecido é NULL.
--
-- Append-only. Nenhuma migração aplicada é editada.

/* ── Assuntos do Mapa Editorial ───────────────────────────────────────────── */

-- Os três pilares são definição versionada em código
-- (`modules/content-brain/editorial.ts`), como as lentes de busca em
-- `20260906001`. O que a base guarda é o que tem estado: os assuntos.
create table if not exists public.content_topic (
  id             uuid primary key default gen_random_uuid(),
  app_user_id    uuid not null references public.app_user (id) on delete cascade,

  slug           text not null,
  pillar_slug    text not null check (pillar_slug in ('ugc_income', 'experiences', 'home')),
  label          text not null,
  /** Como tratar o assunto. Vem do PDF para os assuntos confirmados. */
  how_to_treat   text not null default '',

  /** De onde veio: a source of truth, ela, ou derivado de uso real. */
  origin         text not null default 'sot' check (origin in ('sot', 'carol', 'derived')),

  state          text not null default 'next'
                 check (state in ('now', 'next', 'later', 'paused')),
  state_changed_at timestamptz not null default now(),
  state_reason   text not null default '',

  /** Última peça publicada que acionou este assunto. Alimenta a rotação. */
  last_used_at   timestamptz,
  use_count      integer not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (app_user_id, slug)
);

create index if not exists content_topic_state_idx on public.content_topic (app_user_id, state, pillar_slug);
create index if not exists content_topic_rotation_idx on public.content_topic (app_user_id, last_used_at nulls first);

drop trigger if exists content_topic_touch on public.content_topic;
create trigger content_topic_touch before update on public.content_topic
  for each row execute function public.touch_updated_at();

-- Mudar de fase não pode apagar a fase anterior.
create table if not exists public.content_topic_event (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.content_topic (id) on delete cascade,
  from_state  text,
  to_state    text not null,
  reason      text not null default '',
  actor       text not null default 'carol' check (actor in ('carol', 'system')),
  created_at  timestamptz not null default now()
);

create index if not exists content_topic_event_idx on public.content_topic_event (topic_id, created_at desc);

/* ── Foco Atual ───────────────────────────────────────────────────────────── */

-- Separado dos pilares de propósito: o Mapa muda devagar, a fase muda ao mês.
-- Versionado por intervalo — trocar de foco não reescreve o anterior.
create table if not exists public.content_focus (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  label        text not null default '',
  /** ["career_tech_ugc", "canvas_ugc", ...] — chaves em código. */
  items        text[] not null default '{}',
  note         text not null default '',
  active_from  timestamptz not null default now(),
  active_to    timestamptz,
  created_at   timestamptz not null default now()
);

-- Um foco ativo de cada vez. O índice parcial é quem o garante.
create unique index if not exists content_focus_one_active_idx
  on public.content_focus (app_user_id) where active_to is null;

/* ── Propostas do Motor de Prioridades ────────────────────────────────────── */

create table if not exists public.content_proposal (
  id             uuid primary key default gen_random_uuid(),
  app_user_id    uuid not null references public.app_user (id) on delete cascade,
  plan_id        uuid references public.content_week_plan (id) on delete set null,
  week_start     date not null,
  position       integer not null default 0,

  topic_id       uuid references public.content_topic (id) on delete set null,
  /** Desnormalizado para a proposta sobreviver ao assunto ser apagado. */
  topic_label    text not null default '',
  pillar_slug    text not null check (pillar_slug in ('ugc_income', 'experiences', 'home')),
  angle          text not null,
  lens           text not null check (lens in ('who_i_am', 'how_i_think', 'what_i_do')),
  objective      text not null check (objective in ('attract', 'retain', 'prove', 'convert')),
  format         text not null check (format in ('reel', 'carousel', 'photo_sequence', 'story')),
  /** Estrutura sugerida quando é relevante: talking_head, pov, voice_over… */
  structure      text,
  /** Tech UGC / Canvas UGC / não comercial. Nunca guardado em `format`. */
  commercial_modality text not null default 'none'
                 check (commercial_modality in ('tech_ugc', 'canvas_ugc', 'none')),

  /** «Por que agora» montado a partir de `evidence`, nunca escrito solto. */
  why_now        text not null default '',
  -- [{ kind, detail, refId? }] — kind em `editorial.ts`.
  evidence       jsonb not null default '[]'::jsonb,
  constraint content_proposal_has_evidence
    check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),

  status         text not null default 'proposed'
                 check (status in ('proposed', 'approved_to_develop', 'to_validate',
                                   'ready_to_produce', 'in_production', 'published',
                                   'in_analysis', 'learning_recorded', 'swapped', 'dropped')),

  /** Validação humana, nos dois momentos que o PDF separa. */
  approved_at    timestamptz,
  validated_at   timestamptz,

  -- Sem validação humana não há «pronto». O `check` é a terceira barreira,
  -- depois do domínio e do serviço.
  constraint content_proposal_ready_needs_validation
    check (status not in ('ready_to_produce', 'in_production', 'published',
                          'in_analysis', 'learning_recorded')
           or validated_at is not null),
  constraint content_proposal_develop_needs_approval
    check (status in ('proposed', 'swapped', 'dropped') or approved_at is not null),

  /** Matéria-prima real. O invariant do Content Brain continua de pé: um pack
   *  falado só nasce de fato confirmado. */
  story_id       uuid references public.creator_story (id) on delete set null,
  content_idea_id uuid references public.creator_content_idea (id) on delete set null,
  experiment_id  uuid references public.content_experiment (id) on delete set null,
  /** Quando esta proposta substituiu outra («Trocar»). */
  replaces_id    uuid references public.content_proposal (id) on delete set null,

  /** Ajustes pedidos por ela. Append-only: [{ field, from, to, at }] */
  adjustments    jsonb not null default '[]'::jsonb,

  engine_version text not null default 'CAROL_PRIORITY_V1',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists content_proposal_week_idx on public.content_proposal (app_user_id, week_start desc, position);
create index if not exists content_proposal_status_idx on public.content_proposal (app_user_id, status, updated_at desc);
create index if not exists content_proposal_topic_idx on public.content_proposal (topic_id);

drop trigger if exists content_proposal_touch on public.content_proposal;
create trigger content_proposal_touch before update on public.content_proposal
  for each row execute function public.touch_updated_at();

-- Histórico das transições: uma aprovação não se sobrescreve.
create table if not exists public.content_proposal_event (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.content_proposal (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor        text not null default 'carol' check (actor in ('carol', 'system')),
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists content_proposal_event_idx on public.content_proposal_event (proposal_id, created_at desc);

/* ── Production Pack adaptativo ───────────────────────────────────────────── */

-- Um container por formato. O conteúdo é validado por zod em
-- `modules/content-brain/pack.ts` antes de chegar aqui; o `check` garante que
-- o tipo declarado é um dos que existem.
create table if not exists public.content_production_pack (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.content_proposal (id) on delete cascade,

  kind         text not null check (kind in ('spoken_reel', 'tech_ugc', 'canvas_ugc',
                                             'carousel', 'photo_sequence', 'story_sequence')),
  /** Corpo do pack, com a forma do `kind`. */
  payload      jsonb not null default '{}'::jsonb,
  /** O que ainda falta para ela poder gravar. Nunca «pronto» com isto cheio. */
  gaps         text[] not null default '{}',

  template_key text,
  /** Fato confirmado que sustenta a fala. Sem isto não se gera roteiro. */
  story_id     uuid references public.creator_story (id) on delete set null,

  status       text not null default 'draft'
               check (status in ('draft', 'to_validate', 'validated', 'superseded')),
  validated_at timestamptz,
  constraint content_pack_validated_needs_stamp
    check (status <> 'validated' or validated_at is not null),

  ai_run_id    uuid references public.ai_run (id) on delete set null,
  version      integer not null default 1,
  engine_version text not null default 'CAROL_PACK_V1',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists content_pack_proposal_idx on public.content_production_pack (proposal_id, version desc);

drop trigger if exists content_production_pack_touch on public.content_production_pack;
create trigger content_production_pack_touch before update on public.content_production_pack
  for each row execute function public.touch_updated_at();

/* ── Biblioteca visual ────────────────────────────────────────────────────── */

-- Poucos templates-mãe. Os tokens finais estão ABERTOS no PDF: ficam
-- configuráveis e `pending_tokens` diz o que ainda não foi decidido. Nenhum
-- hex nem fonte é inventado aqui.
create table if not exists public.content_template (
  id             uuid primary key default gen_random_uuid(),
  app_user_id    uuid not null references public.app_user (id) on delete cascade,
  key            text not null,
  label          text not null,
  kind           text not null check (kind in ('carousel_editorial', 'carousel_practical',
                                               'photo_sequence', 'reel_cover')),
  usage_note     text not null default '',
  tokens         jsonb not null default '{}'::jsonb,
  pending_tokens text[] not null default '{}',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (app_user_id, key)
);

drop trigger if exists content_template_touch on public.content_template;
create trigger content_template_touch before update on public.content_template
  for each row execute function public.touch_updated_at();

/* ── Format DNA ───────────────────────────────────────────────────────────── */

-- A assinatura estrutural de uma peça, de uma proposta ou de uma referência.
-- Colunas, não jsonb: a pergunta «que abertura funciona» é um group by.
create table if not exists public.content_format_dna (
  id             uuid primary key default gen_random_uuid(),

  media_id       uuid references public.instagram_media (id) on delete cascade,
  content_idea_id uuid references public.creator_content_idea (id) on delete cascade,
  proposal_id    uuid references public.content_proposal (id) on delete cascade,
  reference_id   uuid references public.creative_reference (id) on delete cascade,
  -- Exatamente um sujeito. Uma assinatura sem dono não diz nada.
  constraint content_format_dna_one_subject check (
    (media_id is not null)::int + (content_idea_id is not null)::int
    + (proposal_id is not null)::int + (reference_id is not null)::int = 1
  ),

  format         text check (format in ('reel', 'carousel', 'photo_sequence', 'story')),
  presentation   text check (presentation in ('talking_head', 'voice_over', 'pov',
                                              'dialogue', 'screen_recording', 'montage')),
  construction   text check (construction in ('single_scene', 'multi_scene', 'process',
                                              'before_after', 'narrative', 'comparison')),
  presence       text check (presence in ('carol', 'product_interface', 'environment', 'other_person')),
  opening        text check (opening in ('speech', 'text', 'action', 'image', 'question', 'statement')),
  pace           text check (pace in ('slow', 'medium', 'fast')),
  audio          text check (audio in ('original_speech', 'voice_over', 'ambient', 'music_trend')),
  duration_band  text check (duration_band in ('under_10s', '10_20s', '20_40s', '40_60s', 'over_60s')),
  on_screen_text text check (on_screen_text in ('absent', 'punctual', 'leading')),
  modality       text check (modality in ('tech_ugc', 'canvas_ugc', 'none')),

  /** De onde saiu cada dimensão. `pack` é a verdade; `inferred` é palpite
   *  assinalado; `carol` corrige os dois. */
  source         text not null default 'pack' check (source in ('pack', 'inferred', 'carol')),
  confidence     text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  engine_version text not null default 'CAROL_FORMAT_DNA_V1',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists content_format_dna_media_uk on public.content_format_dna (media_id) where media_id is not null;
create unique index if not exists content_format_dna_idea_uk on public.content_format_dna (content_idea_id) where content_idea_id is not null;
create unique index if not exists content_format_dna_proposal_uk on public.content_format_dna (proposal_id) where proposal_id is not null;
create unique index if not exists content_format_dna_reference_uk on public.content_format_dna (reference_id) where reference_id is not null;
create index if not exists content_format_dna_format_idx on public.content_format_dna (format, presentation);

drop trigger if exists content_format_dna_touch on public.content_format_dna;
create trigger content_format_dna_touch before update on public.content_format_dna
  for each row execute function public.touch_updated_at();

-- Maturidade por dimensão/valor. Estados, nunca nota de 0 a 100.
create table if not exists public.content_format_state (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  dimension     text not null,
  value         text not null,
  state         text not null default 'untested'
                check (state in ('untested', 'testing', 'early_signal', 'consistent_pattern',
                                 'conditional', 'no_advantage')),
  sample_size   integer not null default 0,
  /** Peças comparáveis que sustentam o estado. Sem comparação não há vantagem. */
  compared_with integer not null default 0,
  because       text not null default '',
  evidence      jsonb not null default '{}'::jsonb,
  policy_version text not null default 'CAROL_FORMAT_MATURITY_V1',
  updated_at    timestamptz not null default now(),
  unique (app_user_id, dimension, value)
);

drop trigger if exists content_format_state_touch on public.content_format_state;
create trigger content_format_state_touch before update on public.content_format_state
  for each row execute function public.touch_updated_at();

/* ── Radar de referências ─────────────────────────────────────────────────── */

create table if not exists public.content_radar_creator (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  handle       text not null,
  platform     text not null default 'instagram'
               check (platform in ('instagram', 'tiktok', 'youtube', 'other')),
  why          text not null default '',
  active       boolean not null default true,
  /** Monitorização automática depende de fornecedor externo. Enquanto não
   *  existir, isto fica `manual` e a tela di-lo. */
  watch_mode   text not null default 'manual' check (watch_mode in ('manual', 'automatic')),
  last_checked_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (app_user_id, platform, handle)
);

alter table public.creative_reference
  add column if not exists radar_creator_id uuid references public.content_radar_creator (id) on delete set null,
  add column if not exists captured_by      text not null default 'system'
                                            check (captured_by in ('carol', 'radar', 'system')),
  /** A engenharia extraída, validada por zod antes de entrar. O que é
   *  consultável vive em `content_format_dna`. */
  add column if not exists analysis         jsonb not null default '{}'::jsonb,
  add column if not exists analysis_status  text not null default 'pending'
                                            check (analysis_status in ('pending', 'done', 'failed', 'unsupported')),
  add column if not exists analysed_at      timestamptz,
  add column if not exists effort           text check (effort in ('low', 'medium', 'high')),
  add column if not exists scene_count      integer,
  /** O teste que nasceu desta referência. Enquanto for nulo, a referência
   *  continua a poder gerar hipótese; depois disso, não gera outra. */
  add column if not exists experiment_id    uuid references public.content_experiment (id) on delete set null;

create index if not exists creative_reference_creator_idx
  on public.creative_reference (purpose, captured_at desc) where purpose = 'creator';

/* ── Qualidade de comunidade ──────────────────────────────────────────────── */

-- As oito intenções do PDF. Três não existiam: curiosidade, conversa e
-- marcação. `other` continua a ser o destino honesto do que não se classifica.
alter table public.instagram_comment drop constraint if exists instagram_comment_quality_check;
alter table public.instagram_comment
  add constraint instagram_comment_quality_check
  check (quality is null or quality in ('generic_praise', 'identification', 'question',
                                        'own_experience', 'purchase_intent', 'professional',
                                        'creator_to_creator', 'brand', 'curiosity',
                                        'conversation', 'tag_share', 'other'));

alter table public.instagram_comment
  /** Probabilístico por desenho: nunca se afirma o que uma pessoa quis dizer. */
  add column if not exists quality_confidence text check (quality_confidence in ('low', 'medium', 'high'));

-- A leitura agregada. Uma pessoa nunca é um fato; o conjunto é um sinal.
create table if not exists public.content_interaction_insight (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  /** Por peça, ou por janela quando `media_id` é nulo. */
  media_id      uuid references public.instagram_media (id) on delete cascade,
  window_from   timestamptz,
  window_to     timestamptz not null,

  /** { identification: 4, curiosity: 2, ... } — contagens, não percentagens. */
  counts        jsonb not null default '{}'::jsonb,
  total         integer not null default 0,
  classified    integer not null default 0,
  /** Quantos ficaram por classificar. Sem isto, 3 de 40 parecem 3 de 3. */
  unclassified  integer not null default 0,
  /** A frase honesta: «poucos comentários para dizer alguma coisa». */
  reading       text not null default '',
  dedupe_key    text not null,
  engine_version text not null default 'CAROL_COMMUNITY_V1',
  created_at    timestamptz not null default now(),
  unique (dedupe_key)
);

create index if not exists content_interaction_insight_media_idx
  on public.content_interaction_insight (media_id, window_to desc);

/* ── Sessão de produção ───────────────────────────────────────────────────── */

create table if not exists public.content_session (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  label        text not null default '',
  /** O que torna estas peças compatíveis: cenário, roupa, equipamento… */
  shared       jsonb not null default '{}'::jsonb,
  /** Ordem de gravação e o que precisa estar pronto antes. */
  checklist    jsonb not null default '[]'::jsonb,
  needs_outing boolean not null default false,
  status       text not null default 'open' check (status in ('open', 'done', 'dropped')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists content_session_touch on public.content_session;
create trigger content_session_touch before update on public.content_session
  for each row execute function public.touch_updated_at();

create table if not exists public.content_session_item (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.content_session (id) on delete cascade,
  proposal_id uuid not null references public.content_proposal (id) on delete cascade,
  position    integer not null default 0,
  unique (session_id, proposal_id)
);

/* ── Experimentos: os campos que o PDF pede e faltavam ────────────────────── */

alter table public.content_experiment
  add column if not exists question      text not null default '',
  /** O que tentamos manter comparável. Sem isto, «o formato venceu» é ruído. */
  add column if not exists constants     text[] not null default '{}',
  add column if not exists window_from   timestamptz,
  add column if not exists window_to     timestamptz,
  add column if not exists window_days   integer,
  /** «Reel Test recomendado» é uma recomendação com motivo, nunca um default. */
  add column if not exists reel_test_recommended boolean not null default false,
  add column if not exists reel_test_reason text not null default '',
  add column if not exists proposal_id   uuid references public.content_proposal (id) on delete set null;

/* ── Aprendizado: período e condições ─────────────────────────────────────── */

alter table public.content_learning
  add column if not exists period_from   timestamptz,
  add column if not exists period_to     timestamptz,
  /** Em que condições vale. Um aprendizado sem condição vira lei. */
  add column if not exists conditions    text[] not null default '{}',
  /** O que o contradiz, com id. Perder força é um estado, não um delete. */
  add column if not exists contradictions jsonb not null default '[]'::jsonb,
  add column if not exists demoted_at    timestamptz,
  add column if not exists demoted_because text;

/* ── Peça: as dimensões que estavam colapsadas ────────────────────────────── */

alter table public.creator_content_idea
  add column if not exists proposal_id         uuid references public.content_proposal (id) on delete set null,
  add column if not exists topic_id            uuid references public.content_topic (id) on delete set null,
  add column if not exists pillar_slug         text check (pillar_slug is null or pillar_slug in ('ugc_income', 'experiences', 'home')),
  add column if not exists editorial_objective text check (editorial_objective is null or editorial_objective in ('attract', 'retain', 'prove', 'convert')),
  add column if not exists content_lens        text check (content_lens is null or content_lens in ('who_i_am', 'how_i_think', 'what_i_do')),
  add column if not exists commercial_modality text not null default 'none' check (commercial_modality in ('tech_ugc', 'canvas_ugc', 'none')),
  /** Inferido, declarado no pack, ou corrigido por ela. Nunca se mostra um
   *  palpite como se fosse escolha dela. */
  add column if not exists classification_source text not null default 'unknown'
                                                check (classification_source in ('unknown', 'inferred', 'proposal', 'carol'));

create index if not exists creator_content_idea_objective_idx
  on public.creator_content_idea (editorial_objective, plan_date desc);
create index if not exists creator_content_idea_pillar_slug_idx
  on public.creator_content_idea (pillar_slug, plan_date desc);
create index if not exists creator_content_idea_proposal_idx
  on public.creator_content_idea (proposal_id);

alter table public.creator_story
  add column if not exists topic_id    uuid references public.content_topic (id) on delete set null,
  add column if not exists pillar_slug text check (pillar_slug is null or pillar_slug in ('ugc_income', 'experiences', 'home'));

create index if not exists creator_story_topic_idx on public.creator_story (topic_id);

/* ── Plano da semana: o que faltava para ser um plano ─────────────────────── */

-- `primary_pillar` guardava um pilar funcional (que agora é objetivo). Passa a
-- poder ser nulo: a semana equilibra objetivos, não elege um pilar.
alter table public.content_week_plan alter column primary_pillar drop not null;

alter table public.content_week_plan
  add column if not exists capacity        integer not null default 3,
  /** «1 para atrair, 1 para reter, 1 para provar.» Montado do domínio. */
  add column if not exists strategy_summary text not null default '',
  add column if not exists objective_mix   jsonb not null default '{}'::jsonb,
  add column if not exists engine_version  text not null default 'CAROL_PRIORITY_V1',
  add column if not exists focus_id        uuid references public.content_focus (id) on delete set null;

/* ── Hoje: os pedidos novos ───────────────────────────────────────────────── */

alter table public.action_item drop constraint if exists action_item_type_check;
alter table public.action_item
  add constraint action_item_type_check
  check (type in ('respond', 'follow_up', 'send_portfolio', 'ask_scope', 'send_rate',
                  'negotiate', 'create_proposal', 'start_production', 'request_brief',
                  'deliver', 'request_metrics', 'upsell', 'renew_rights', 'nurture',
                  'close', 'review', 'wait_expired', 'integration_fix', 'chase_payment',
                  'content_map_story', 'content_develop_story', 'content_record_ready',
                  'content_confirm_trial', 'content_save_event', 'content_review_signal',
                  'content_link_media',
                  -- Existia em código desde 21/09 e nunca entrou no `check`:
                  -- uma decisão de fechar teste batia no Postgres.
                  'content_close_test',
                  'content_validate_week', 'content_validate_pack'));

/* ── RLS ──────────────────────────────────────────────────────────────────── */

alter table public.content_topic               enable row level security;
alter table public.content_topic_event         enable row level security;
alter table public.content_focus               enable row level security;
alter table public.content_proposal            enable row level security;
alter table public.content_proposal_event      enable row level security;
alter table public.content_production_pack     enable row level security;
alter table public.content_template            enable row level security;
alter table public.content_format_dna          enable row level security;
alter table public.content_format_state        enable row level security;
alter table public.content_radar_creator       enable row level security;
alter table public.content_interaction_insight enable row level security;
alter table public.content_session             enable row level security;
alter table public.content_session_item        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['content_topic', 'content_topic_event', 'content_focus',
                           'content_proposal', 'content_proposal_event',
                           'content_production_pack', 'content_template',
                           'content_format_dna', 'content_format_state',
                           'content_radar_creator', 'content_interaction_insight',
                           'content_session', 'content_session_item']
  loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated '
      'using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;

/* ── Horário ──────────────────────────────────────────────────────────────── */

-- Mesma lista de `20260921001` mais dois trabalhos:
--   `content-community` classifica comentários e agrega intenção (06:50, antes
--   do aprendizado, porque é dele que a auditoria tira comunidade);
--   `content-week` corre o Motor de Prioridades à segunda de manhã, depois da
--   auditoria e do aprendizado.
create or replace function public.carolos_apply_schedule()
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = public, cron, extensions
as $$
declare
  v_jobs constant text[][] := array[
    ['carolos-gmail-sync',        '*/15 6-21 * * *', 'gmail-sync'],
    ['carolos-process-pending',   '7,37 * * * *',    'process-pending'],
    ['carolos-followups',         '12 * * * *',      'followups'],
    ['carolos-plan',              '22 * * * *',      'plan'],
    ['carolos-imports',           '*/10 6-22 * * *', 'imports'],
    ['carolos-instagram-sync',    '*/30 * * * *',    'instagram-sync'],
    ['carolos-triage',            '5 6 * * *',       'triage'],
    ['carolos-outreach',          '10 6 * * *',      'outreach'],
    ['carolos-references',        '25 6 * * *',      'references'],
    ['carolos-trends',            '35 6 * * *',      'trends'],
    ['carolos-rights',            '40 6 * * *',      'rights'],
    ['carolos-metrics',           '45 6 * * *',      'metrics'],
    ['carolos-upsell',            '50 6 * * *',      'upsell'],
    ['carolos-content-community', '50 6 * * *',      'content-community'],
    ['carolos-insights',          '55 6 * * *',      'insights'],
    ['carolos-milestones',        '58 6 * * *',      'milestones'],
    ['carolos-instagram-token',   '2 6 * * *',       'instagram-token'],
    ['carolos-content-learning',  '2 7 * * *',       'content-learning'],
    ['carolos-content-audit',     '4 7 * * *',       'content-audit'],
    ['carolos-story-candidates',  '5 7 * * *',       'story-candidates'],
    ['carolos-audio-cleanup',     '30 4 * * *',      'audio-cleanup'],
    -- Segunda de manhã. A semana nasce antes de ela abrir o CarolOS.
    ['carolos-content-week',      '6 7 * * 1',       'content-week'],
    ['carolos-content',           '7 7 * * *',       'content-plan'],
    ['carolos-morning',           '10 7 * * *',      'morning']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_jobs, 1) loop
    perform cron.unschedule(v_jobs[i][1])
      where exists (select 1 from cron.job j where j.jobname = v_jobs[i][1]);
    perform cron.schedule(
      v_jobs[i][1], v_jobs[i][2],
      format('select public.carolos_dispatch_job(%L)', v_jobs[i][3])
    );
  end loop;

  perform cron.unschedule('carolos-reconcile')
    where exists (select 1 from cron.job j where j.jobname = 'carolos-reconcile');
  perform cron.schedule('carolos-reconcile', '*/5 * * * *',
    'select public.carolos_reconcile_dispatches()');

  return query
    select j.jobname::text, j.schedule::text
    from cron.job j where j.jobname like 'carolos-%' order by j.jobname;
end;
$$;

revoke execute on function public.carolos_apply_schedule() from anon, authenticated, public;
