import { z } from 'zod';

/** Os contratos de saída de cada tarefa de IA.
 *
 *  Regra que atravessa todos: o que não foi dito não se preenche. Um campo de
 *  dinheiro ou de direitos só aparece quando a mensagem o afirma — «não sei» é
 *  uma resposta válida, inventar um valor não é. */

export const REPLY_TYPES = [
  'interest',
  'portfolio_request',
  'rate_request',
  'ads_rights',
  'barter_offer',
  'affiliate_offer',
  'media_kit_request',
  'call_request',
  'rejection',
  'future_followup',
  'referral',
  'brief',
  'approval',
  'revision',
  'delivery',
  'payment',
  'logistics',
  'other',
] as const;

export type ReplyType = (typeof REPLY_TYPES)[number];

export const REPLY_TYPE_LABEL: Record<ReplyType, string> = {
  interest: 'Interesse',
  portfolio_request: 'Pede portfólio',
  rate_request: 'Pede preço',
  ads_rights: 'Pede direitos para anúncios',
  barter_offer: 'Oferece permuta',
  affiliate_offer: 'Oferece afiliação',
  media_kit_request: 'Pede media kit',
  call_request: 'Pede call',
  rejection: 'Recusa',
  future_followup: 'Fica para depois',
  referral: 'Encaminha para outra pessoa',
  brief: 'Briefing',
  approval: 'Aprovação',
  revision: 'Pede revisão',
  delivery: 'Entrega ou logística',
  payment: 'Pagamento',
  logistics: 'Logística',
  other: 'Outro',
};

const confidence = z.number().min(0).max(1);

/** ── classify_commercial_thread ────────────────────────────────────────── */
export const ThreadClassificationSchema = z.object({
  is_commercial: z.boolean(),
  confidence,
  category: z.enum(['outreach', 'reply', 'proposal', 'production', 'other']),
  brand_candidate: z.string().nullable(),
  reason_codes: z.array(z.string()).max(6),
});
export type ThreadClassification = z.infer<typeof ThreadClassificationSchema>;

/** ── extract_commercial_message ────────────────────────────────────────── */
export const CommercialExtractionSchema = z.object({
  reply_types: z.array(z.enum(REPLY_TYPES)).min(1),
  brand_name: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_role: z.string().nullable(),
  product_or_campaign: z.string().nullable(),
  requested_actions: z.array(z.string()),
  compensation_model: z
    .enum(['paid', 'barter', 'reimbursement', 'hybrid', 'influencer', 'affiliate', 'unclear'])
    .nullable(),
  cash_amount_cents: z.number().int().nonnegative().nullable(),
  currency: z.string().nullable(),
  barter_product: z.string().nullable(),
  barter_value_cents: z.number().int().nonnegative().nullable(),
  paid_usage_requested: z.boolean(),
  usage_period: z.string().nullable(),
  usage_platforms: z.array(z.string()),
  raw_footage_requested: z.boolean(),
  exclusivity_requested: z.boolean(),
  whitelisting_requested: z.boolean(),
  deadline: z.string().nullable(),
  promised_reply_date: z.string().nullable(),
  explicit_acceptance: z.boolean(),
  explicit_rejection: z.boolean(),
  deferral: z.boolean(),
  rejection_reason: z.string().nullable(),
  questions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  evidence_spans: z.array(z.string()).max(8),
  confidence,
});
export type CommercialExtraction = z.infer<typeof CommercialExtractionSchema>;

/** ── recommend_next_action ─────────────────────────────────────────────── */
export const NextActionSchema = z.object({
  action_type: z.enum([
    'RESPOND', 'FOLLOW_UP', 'SEND_PORTFOLIO', 'ASK_SCOPE', 'SEND_RATE', 'NEGOTIATE',
    'CREATE_PROPOSAL', 'START_PRODUCTION', 'REQUEST_METRICS', 'UPSELL', 'RENEW_RIGHTS',
    'NURTURE', 'CLOSE',
  ]),
  recommended_action: z.string(),
  why: z.string(),
  risk_flags: z.array(z.string()),
  questions_to_resolve: z.array(z.string()),
  confidence,
  requires_human_approval: z.boolean(),
});
export type NextActionRecommendation = z.infer<typeof NextActionSchema>;

/** ── draft_reply ───────────────────────────────────────────────────────── */
export const ReplyDraftSchema = z.object({
  subject: z.string().nullable(),
  body: z.string(),
  rationale: z.string(),
  /** Compromissos que o rascunho evita de propósito. */
  avoided_commitments: z.array(z.string()),
  confidence,
});
export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

/** ── negotiation_recommendation ────────────────────────────────────────── */
export const NegotiationSchema = z.object({
  summary: z.string(),
  brand_request: z.string(),
  offer_classification: z.enum([
    'paid_production', 'barter', 'reimbursement', 'affiliate', 'influencer_posting', 'hybrid', 'unclear',
  ]),
  missing_information: z.array(z.string()),
  risks: z.array(z.object({ code: z.string(), severity: z.enum(['low', 'medium', 'high']), note: z.string() })),
  recommendation: z.enum(['ACCEPT', 'NEGOTIATE', 'ASK', 'DECLINE', 'NURTURE']),
  reasoning: z.string(),
  safe_concessions: z.array(z.string()),
  dangerous_concessions: z.array(z.string()),
  suggested_reply: z.string(),
  confidence,
});
export type NegotiationAnalysis = z.infer<typeof NegotiationSchema>;

/** ── brief_parser ──────────────────────────────────────────────────────── */
export const BriefSchema = z.object({
  objective: z.string().nullable(),
  product: z.string().nullable(),
  audience: z.string().nullable(),
  key_messages: z.array(z.string()),
  claims: z.array(z.string()),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
  cta: z.string().nullable(),
  duration: z.string().nullable(),
  format: z.string().nullable(),
  channels: z.array(z.string()),
  paid: z.boolean().nullable(),
  organic: z.boolean().nullable(),
  usage_period: z.string().nullable(),
  deadline: z.string().nullable(),
  revisions: z.number().int().nonnegative().nullable(),
  raw_footage: z.boolean().nullable(),
  music_licensing: z.string().nullable(),
  exclusivity: z.boolean().nullable(),
  gaps: z.array(z.string()),
  risk_flags: z.array(z.object({ code: z.string(), severity: z.enum(['low', 'medium', 'high']), note: z.string() })),
  questions_for_brand: z.array(z.string()),
  confidence,
});
export type ParsedBrief = z.infer<typeof BriefSchema>;

/** ── brand_dossier ─────────────────────────────────────────────────────── */
/** Os sinais que o motor de encaixe pontua, um por critério e todos nomeados.
 *
 *  Era um `z.record` nos dois sítios que o usam. O Gemini não sabe o que pôr num
 *  objeto sem propriedades declaradas: aceitava o pedido e devolvia `{}`, todos
 *  os critérios ficavam por saber, e como desconhecido conta como neutro todas
 *  as marcas saíam com a mesma nota. Um erro seria melhor do que isto, porque
 *  pelo menos aparecia.
 *
 *  Nulo é «não sei», e é diferente de zero. O teste em `fit.test.ts` garante que
 *  estes campos são exatamente os critérios que o motor pesa. */
const fitSignal = (o: string) => z.number().nullable().describe(o);

export const FitSignalsSchema = z.object({
  category: fitSignal('0-5: quão tech-first é a categoria'),
  paid_maturity: fitSignal('0-5: maturidade em paid media e criativos'),
  demo_potential: fitSignal('0-5: dá para demonstrar problema e solução em vídeo'),
  budget_signals: fitSignal('0-5: sinais de orçamento de marketing'),
  authentic_context: fitSignal('0-5: cabe na vida real dela, em casa'),
  economics: fitSignal('0-5: a colaboração paga-se'),
  recurring_demand: fitSignal('0-5: precisam de criativos de forma recorrente'),
  aesthetic: fitSignal('0-5: alinhamento estético'),
  contact_access: fitSignal('0-5: dá para chegar a quem decide'),
  logistics: fitSignal('0-5: idioma, envio, fuso'),
  portfolio_value: fitSignal('0-5: o que esta marca faz pelo portfólio dela'),
});

export const DossierSchema = z.object({
  what_they_sell: z.string(),
  why_it_fits: z.string(),
  paid_creator_maturity: z.string(),
  best_product_to_pitch: z.string().nullable(),
  creative_opportunities: z.array(z.string()).max(3),
  commercial_signal: z.string(),
  contact_path: z.string().nullable(),
  risks: z.array(z.string()),
  niche_id: z.string().nullable(),
  fit_signals: FitSignalsSchema,
  evidence: z.array(z.object({ claim: z.string(), source: z.string() })),
  unknowns: z.array(z.string()),
  confidence,
});
export type BrandDossier = z.infer<typeof DossierSchema>;

/** ── creative_hypothesis ───────────────────────────────────────────────── */
export const CreativeSchema = z.object({
  hypotheses: z
    .array(
      z.object({
        title: z.string(),
        funnel_role: z.enum(['DISCOVERY', 'CONSIDERATION', 'DECISION']),
        friction: z.string(),
        hook: z.string(),
        core_message: z.string(),
        demonstration: z.string(),
        cta: z.string(),
        emotion: z.string(),
        capabilities: z.array(z.string()),
      }),
    )
    .min(1)
    .max(5),
  avoided_repetition: z.array(z.string()),
  confidence,
});
export type CreativeHypotheses = z.infer<typeof CreativeSchema>;

/** ── quick_capture ─────────────────────────────────────────────────────── */
export const CaptureSchema = z.object({
  brand_name: z.string().nullable(),
  website: z.string().nullable(),
  instagram_handle: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_role: z.string().nullable(),
  product_name: z.string().nullable(),
  product_price_cents: z.number().int().nonnegative().nullable(),
  niche_id: z.string().nullable(),
  country_code: z.string().nullable(),
  probable_stage: z
    .enum(['discovered', 'qualified', 'outreach', 'replied', 'commercial_qualification', 'proposal', 'negotiation'])
    .nullable(),
  asks: z.array(z.string()),
  deadlines: z.array(z.string()),
  summary: z.string(),
  unknowns: z.array(z.string()),
  confidence,
});
export type CaptureExtraction = z.infer<typeof CaptureSchema>;

/** ── upsell_scan ───────────────────────────────────────────────────────── */
export const UpsellSchema = z.object({
  warranted: z.boolean(),
  offer_type: z
    .enum(['variation_pack', 'second_creative', 'creative_pack_3', 'performance_pack_5',
           'monthly_retainer', 'usage_renewal', 'nurture'])
    .nullable(),
  timing: z.enum(['now', 'in_days', 'after_metrics', 'not_yet']),
  days_to_wait: z.number().int().nonnegative().nullable(),
  reason: z.string(),
  angle: z.string().nullable(),
  confidence,
});
export type UpsellScan = z.infer<typeof UpsellSchema>;

/** A leitura do dia. Uma frase só: se precisar de duas, não é uma leitura, é
 *  um relatório — e disso a Carol já tem a fila abaixo. */
export const DailyReadSchema = z.object({
  read: z.string(),
});
export type DailyRead = z.infer<typeof DailyReadSchema>;

/* ── Prospecção diária ──────────────────────────────────────────────────── */

export const OutreachStyleSchema = z.object({
  formality: z.string(),
  opening: z.string(),
  howSheIntroducesHerself: z.string(),
  howSheExplainsUgc: z.string(),
  howMuchOfTheIdeaSheReveals: z.string(),
  ctaStyle: z.string(),
  avoids: z.array(z.string()),
});
export type OutreachStyle = z.infer<typeof OutreachStyleSchema>;

export const OutreachResearchSchema = z.object({
  /** O produto, plano ou funcionalidade concreta a nomear. Null se não houver. */
  product: z.string().nullable(),
  category: z.string().nullable(),
  /** Onde estão, de verdade. Um site em português não faz uma empresa
   *  portuguesa: só conta com prova — morada, registo, domínio nacional. */
  city: z.string().nullable().describe('cidade da sede, se houver prova'),
  country: z.string().nullable().describe('país da sede, com prova; null se não souberes'),
  why_fit: z.string(),
  why_now: z.string(),
  why_may_pay: z.string(),
  risk: z.string(),
  paid_media_signal: z.enum(['none', 'weak', 'medium', 'strong']),
  paid_media_evidence: z.string(),
  ugc_signal: z.enum(['none', 'product_only', 'influencers', 'ugc', 'creator_program']),
  ugc_evidence: z.string(),
  /** O que a Carol faria melhor ou diferente. Não «usam UGC». */
  creative_opportunity: z.string(),
  content_ideas: z.array(z.object({ title: z.string(), angle: z.string() })),
  red_flags: z.array(z.string()),
  /** Por onde se fala com eles.
   *
   *  O email vinha sempre nulo porque a pesquisa não tinha web e o prompt — bem
   *  — proíbe inventar endereços. Agora tem, e pede-se mais do que email: o
   *  WhatsApp é o canal que ela usa mesmo, e o Instagram serve quando não há
   *  WhatsApp. Telefone fixo não interessa. */
  contact: z
    .object({
      name: z.string().nullable(),
      role: z.string().nullable(),
      email: z.string().nullable(),
      /** Só se for mesmo WhatsApp: um fixo aqui é pior do que campo vazio. */
      whatsapp: z.string().nullable().describe('número de WhatsApp com indicativo, ou null'),
      instagram: z.string().nullable().describe('@utilizador do perfil da marca'),
      confidence: z.enum(['verified', 'high', 'medium', 'low', 'unknown']),
      source: z.string().nullable(),
    })
    .nullable(),
  /** Cada fato usado, com o sítio onde foi visto. */
  sources: z.array(z.object({ label: z.string(), url: z.string().nullable() })),
  /** Onde a marca publica. É por aqui que ela vê o que já fazem antes de falar. */
  socials: z.object({
    instagram: z.string().nullable().describe('@utilizador ou URL do perfil'),
    tiktok: z.string().nullable(),
    youtube: z.string().nullable(),
    linkedin: z.string().nullable(),
  }),
  /** Sinais para o motor de encaixe. Desconhecido é null, não zero. */
  fit_signals: FitSignalsSchema,
});
export type OutreachResearch = z.infer<typeof OutreachResearchSchema>;

export const OutreachEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  /** Cada afirmação factual do email, ligada à fonte que a sustenta. */
  claims: z.array(z.object({ text: z.string(), source: z.string().nullable() })),
  cta: z.string(),
});
export type OutreachEmail = z.infer<typeof OutreachEmailSchema>;
