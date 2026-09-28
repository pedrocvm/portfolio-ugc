import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

/** Os tipos das tabelas de `20260928001_carolos_content_strategy`.
 *
 *  `database.types.ts` é gerado contra a base real (`npm run db:types`) e a
 *  migração só existe na base depois do deploy. Até lá as tabelas novas não
 *  têm tipo, e sem tipo o cliente do Supabase recusa `from('content_topic')`.
 *
 *  Escritos à mão, num sítio só, e substituídos pela geração assim que a
 *  migração estiver aplicada. A única conversão de tipo da camada vive aqui
 *  embaixo, em `strategyClient`, em vez de espalhada por cada serviço.
 *
 *  `Insert` e `Update` são parciais de propósito: quem garante o obrigatório é
 *  o `not null` do Postgres, e repetir aqui a lista de colunas obrigatórias
 *  seria uma segunda fonte de verdade a envelhecer sozinha. */

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type Tables = Database['public']['Tables'];
type RowOf<K extends keyof Tables> = Tables[K]['Row'];

export type ContentTopicRow = {
  id: string;
  app_user_id: string;
  slug: string;
  pillar_slug: string;
  label: string;
  how_to_treat: string;
  origin: string;
  state: string;
  state_changed_at: string;
  state_reason: string;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type ContentTopicEventRow = {
  id: string;
  topic_id: string;
  from_state: string | null;
  to_state: string;
  reason: string;
  actor: string;
  created_at: string;
};

export type ContentFocusRow = {
  id: string;
  app_user_id: string;
  label: string;
  items: string[];
  note: string;
  active_from: string;
  active_to: string | null;
  created_at: string;
};

export type ContentProposalRow = {
  id: string;
  app_user_id: string;
  plan_id: string | null;
  week_start: string;
  position: number;
  topic_id: string | null;
  topic_label: string;
  pillar_slug: string;
  angle: string;
  lens: string;
  objective: string;
  format: string;
  structure: string | null;
  commercial_modality: string;
  why_now: string;
  evidence: Json;
  status: string;
  approved_at: string | null;
  validated_at: string | null;
  story_id: string | null;
  content_idea_id: string | null;
  experiment_id: string | null;
  replaces_id: string | null;
  adjustments: Json;
  engine_version: string;
  created_at: string;
  updated_at: string;
};

export type ContentProposalEventRow = {
  id: string;
  proposal_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  note: string;
  created_at: string;
};

export type ContentProductionPackRow = {
  id: string;
  proposal_id: string;
  kind: string;
  payload: Json;
  gaps: string[];
  template_key: string | null;
  story_id: string | null;
  status: string;
  validated_at: string | null;
  ai_run_id: string | null;
  version: number;
  engine_version: string;
  created_at: string;
  updated_at: string;
};

export type ContentTemplateRow = {
  id: string;
  app_user_id: string;
  key: string;
  label: string;
  kind: string;
  usage_note: string;
  tokens: Json;
  pending_tokens: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ContentFormatDnaRow = {
  id: string;
  media_id: string | null;
  content_idea_id: string | null;
  proposal_id: string | null;
  reference_id: string | null;
  format: string | null;
  presentation: string | null;
  construction: string | null;
  presence: string | null;
  opening: string | null;
  pace: string | null;
  audio: string | null;
  duration_band: string | null;
  on_screen_text: string | null;
  modality: string | null;
  source: string;
  confidence: string;
  engine_version: string;
  created_at: string;
  updated_at: string;
};

export type ContentFormatStateRow = {
  id: string;
  app_user_id: string;
  dimension: string;
  value: string;
  state: string;
  sample_size: number;
  compared_with: number;
  because: string;
  evidence: Json;
  policy_version: string;
  updated_at: string;
};

export type ContentRadarCreatorRow = {
  id: string;
  app_user_id: string;
  handle: string;
  platform: string;
  why: string;
  active: boolean;
  watch_mode: string;
  last_checked_at: string | null;
  created_at: string;
};

export type ContentInteractionInsightRow = {
  id: string;
  app_user_id: string;
  media_id: string | null;
  window_from: string | null;
  window_to: string;
  counts: Json;
  total: number;
  classified: number;
  unclassified: number;
  reading: string;
  dedupe_key: string;
  engine_version: string;
  created_at: string;
};

export type ContentSessionRow = {
  id: string;
  app_user_id: string;
  label: string;
  shared: Json;
  checklist: Json;
  needs_outing: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ContentSessionItemRow = {
  id: string;
  session_id: string;
  proposal_id: string;
  position: number;
};

/* ── Colunas novas em tabelas que já existiam ─────────────────────────────── */

type ExperimentExtra = {
  question: string;
  constants: string[];
  window_from: string | null;
  window_to: string | null;
  window_days: number | null;
  reel_test_recommended: boolean;
  reel_test_reason: string;
  proposal_id: string | null;
};

type LearningExtra = {
  period_from: string | null;
  period_to: string | null;
  conditions: string[];
  contradictions: Json;
  demoted_at: string | null;
  demoted_because: string | null;
};

type IdeaExtra = {
  proposal_id: string | null;
  topic_id: string | null;
  pillar_slug: string | null;
  editorial_objective: string | null;
  content_lens: string | null;
  commercial_modality: string;
  classification_source: string;
};

type StoryExtra = {
  topic_id: string | null;
  pillar_slug: string | null;
};

type WeekPlanExtra = {
  capacity: number;
  strategy_summary: string;
  objective_mix: Json;
  engine_version: string;
  focus_id: string | null;
};

type ReferenceExtra = {
  radar_creator_id: string | null;
  captured_by: string;
  analysis: Json;
  analysis_status: string;
  analysed_at: string | null;
  effort: string | null;
  scene_count: number | null;
  hypothesis_id: string | null;
};

type CommentExtra = {
  quality_confidence: string | null;
};

type StrategyTables = {
  content_topic: Table<ContentTopicRow>;
  content_topic_event: Table<ContentTopicEventRow>;
  content_focus: Table<ContentFocusRow>;
  content_proposal: Table<ContentProposalRow>;
  content_proposal_event: Table<ContentProposalEventRow>;
  content_production_pack: Table<ContentProductionPackRow>;
  content_template: Table<ContentTemplateRow>;
  content_format_dna: Table<ContentFormatDnaRow>;
  content_format_state: Table<ContentFormatStateRow>;
  content_radar_creator: Table<ContentRadarCreatorRow>;
  content_interaction_insight: Table<ContentInteractionInsightRow>;
  content_session: Table<ContentSessionRow>;
  content_session_item: Table<ContentSessionItemRow>;

  content_experiment: Table<RowOf<'content_experiment'> & ExperimentExtra>;
  content_learning: Table<RowOf<'content_learning'> & LearningExtra>;
  creator_content_idea: Table<RowOf<'creator_content_idea'> & IdeaExtra>;
  creator_story: Table<RowOf<'creator_story'> & StoryExtra>;
  content_week_plan: Table<RowOf<'content_week_plan'> & WeekPlanExtra>;
  creative_reference: Table<RowOf<'creative_reference'> & ReferenceExtra>;
  instagram_comment: Table<RowOf<'instagram_comment'> & CommentExtra>;
};

export type StrategyDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Omit<Tables, keyof StrategyTables> & StrategyTables;
  };
};

export type StrategyClient = SupabaseClient<StrategyDatabase>;

/** A única conversão de tipo da camada de estratégia. Sai quando
 *  `npm run db:types` correr contra a base com a migração aplicada. */
export const strategyClient = (client: SupabaseClient<Database>): StrategyClient =>
  client as unknown as StrategyClient;
