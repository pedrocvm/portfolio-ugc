/** O vocabulário que a Carol lê.
 *
 *  Os valores salvos são ids de máquina estáveis — `commercial_qualification`,
 *  `usage_license`, `script_approved` — e é assim que têm de ficar na base: uma
 *  etiqueta traduzida como valor gravado parte-se na primeira vez que alguém
 *  muda uma palavra.
 *
 *  O problema é o outro lado: metade da tela traduzia e a outra metade não, e
 *  chegava a acontecer na mesma linha — «Pede preço» ao lado de «negotiation».
 *  Isto existe para haver um sítio só, e para o próximo enum não voltar a
 *  aparecer cru por esquecimento.
 *
 *  Os domínios que já têm vocabulário próprio (etapas, estados de produção,
 *  papéis no funil, situações de follow-up) continuam a mandar no seu; aqui
 *  ficam os que não tinham casa. */

const DICTIONARIES: Record<string, Record<string, string>> = {
  /** `payment.kind` */
  paymentKind: {
    cash: 'dinheiro',
    reimbursement: 'reembolso',
    barter: 'permuta',
    usage_license: 'licença de uso',
  },

  /** `payment.status` */
  paymentStatus: {
    due: 'por receber',
    invoiced: 'faturado',
    paid: 'recebido',
    written_off: 'perdido',
  },

  /** `rights_license.status` */
  licenseStatus: {
    draft: 'rascunho',
    active: 'ativa',
    expired: 'expirada',
    renewed: 'renovada',
    cancelled: 'cancelada',
  },

  /** O que `expiryStatus()` devolve. */
  expiry: {
    no_end: 'sem data de fim',
    active: 'dentro do prazo',
    expiring: 'a expirar',
    expired: 'expirada',
  },

  /** `document.status` e `quote.status` partilham o mesmo vocabulário. */
  documentStatus: {
    draft: 'rascunho',
    approved: 'aprovado',
    sent: 'enviado',
    accepted: 'aceite',
    rejected: 'recusado',
    superseded: 'substituído',
  },

  /** `deliverable.approval_status` */
  approval: {
    pending: 'à espera',
    revision_requested: 'revisão pedida',
    approved: 'aprovada',
  },

  /** `deliverable.feedback_class` */
  feedbackClass: {
    in_scope: 'correção incluída',
    subjective: 'revisão subjectiva',
    brief_change: 'mudança de briefing',
    new_deliverable: 'trabalho novo',
  },

  /** `content_asset.status` */
  contentStatus: {
    concept: 'conceito',
    script: 'roteiro',
    script_approved: 'roteiro aprovado',
    shooting: 'a gravar',
    editing: 'em edição',
    delivered: 'entregue',
    revision: 'em revisão',
    approved: 'aprovado',
    archived: 'arquivado',
  },

  /** `brief.status` */
  briefStatus: {
    parsed: 'lido',
    incomplete: 'incompleto',
    validated: 'validado',
    superseded: 'substituído',
  },

  /** `capture_item.kind` */
  captureKind: {
    url: 'link',
    text: 'texto',
    screenshot: 'print',
    profile: 'perfil',
    product: 'produto',
    conversation: 'conversa',
    brief: 'briefing',
  },

  /** `contact.preferred_channel` */
  channel: {
    email: 'e-mail',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    call: 'chamada',
    other: 'outro',
  },

  /** `job_run.status` e o estado de um disparo. */
  runStatus: {
    running: 'a correr',
    success: 'correu',
    error: 'falhou',
    skipped: 'saltado',
  },

  /** `pricing_policy.status` */
  policyStatus: {
    draft: 'rascunho',
    active: 'em uso',
    retired: 'retirada',
  },
};

export type Vocabulary = keyof typeof DICTIONARIES;

/** Traduz, e devolve o valor original quando não conhece — nunca uma cadeia
 *  vazia. Um id à vista é feio; um espaço em branco esconde informação. */
export function label(vocabulary: Vocabulary, value: string | null | undefined): string {
  if (!value) return '—';
  return DICTIONARIES[vocabulary][value] ?? value;
}

/** Os nomes técnicos dos trabalhos de fundo. Aparecem na folha de observação,
 *  que é para o Pedro, mas não custa nada serem legíveis. */
export const JOB_LABEL: Record<string, string> = {
  'gmail-sync': 'Sincronizar Gmail',
  'process-pending': 'Processar pendentes',
  followups: 'Follow-ups',
  plan: 'Recalcular fila',
  rights: 'Licenças',
  metrics: 'Métricas',
  upsell: 'Upsell',
  insights: 'Procurar avisos',
  outreach: 'Procurar marcas',
  all: 'Todos',
};

export const AI_TASK_LABEL: Record<string, string> = {
  classify_commercial_thread: 'Classificar conversa',
  extract_commercial_message: 'Extrair fatos',
  recommend_next_action: 'Recomendar próxima ação',
  draft_reply: 'Escrever rascunho',
  negotiation_analysis: 'Analisar negociação',
  brief_parser: 'Ler briefing',
  brand_dossier: 'Dossiê de marca',
  creative_hypothesis: 'Hipóteses criativas',
  parse_capture: 'Ler captura',
  upsell_scan: 'Procurar upsell',
};

export const jobLabel = (id: string) => JOB_LABEL[id] ?? id;
export const aiTaskLabel = (id: string) => AI_TASK_LABEL[id] ?? id;
