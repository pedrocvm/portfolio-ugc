/** As bandeiras vivem na base, não no deploy: virar uma automação depois de a
 *  ver a correr em modo sombra tem de ser um clique, não um push.
 *
 *  Uma variável de ambiente pode fechar uma bandeira à força — é assim que os
 *  previews não falam com o Gmail de produção — mas nunca a pode abrir. */

export const FLAG_KEYS = [
  'gmail_ingestion',
  'ai_enabled',
  'ai_classification',
  'ai_drafting',
  'gmail_draft_creation',
  'external_send',
  'auto_apply_low_risk',
  'background_jobs',
  'assistant_enabled',
  'daily_outreach',
  'shadow_mode',
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];
export type Flags = Record<FlagKey, boolean>;

export const FLAG_LABEL: Record<FlagKey, string> = {
  gmail_ingestion: 'Ingestão do Gmail',
  ai_enabled: 'Camada de IA',
  ai_classification: 'Classificação automática',
  ai_drafting: 'Rascunhos de resposta',
  gmail_draft_creation: 'Criar rascunho no Gmail',
  external_send: 'Envio externo automático',
  auto_apply_low_risk: 'Aplicar mudanças de baixo risco',
  background_jobs: 'Trabalhos em segundo plano',
  assistant_enabled: 'Carol AI',
  daily_outreach: 'Prospecção diária',
  shadow_mode: 'Modo sombra',
};

export const FLAG_NOTE: Record<FlagKey, string> = {
  gmail_ingestion: 'Ler as conversas do Gmail e transformá-las em marcas, contatos e eventos.',
  ai_enabled: 'Interruptor geral. Fechado, nenhuma tarefa de IA corre.',
  ai_classification: 'Classificar respostas e extrair fatos comerciais.',
  ai_drafting: 'Preparar texto de resposta para você revisar.',
  gmail_draft_creation: 'Escrever o rascunho aprovado na sua caixa do Gmail.',
  external_send:
    'Enviar mensagens sem aprovação. Fica fechado: nenhuma decisão comercial sai daqui sozinha.',
  auto_apply_low_risk:
    'Deixar o sistema aplicar mudanças de estado óbvias em vez de as propor.',
  background_jobs: 'Correr sincronizações e verificações sem ninguém abrir o painel.',
  assistant_enabled:
    'O assistente que lê os teus dados e responde. Sem isto o botão não aparece.',
  daily_outreach:
    'Procurar marcas novas todas as manhãs, pesquisá-las e preparar o email. Nunca envia sozinho.',
  shadow_mode: 'Observar e recomendar sem mexer no estado. Liga isto primeiro.',
};

export const DEFAULT_FLAGS: Flags = {
  gmail_ingestion: false,
  ai_enabled: false,
  ai_classification: false,
  ai_drafting: false,
  gmail_draft_creation: false,
  external_send: false,
  auto_apply_low_risk: false,
  background_jobs: false,
  assistant_enabled: false,
  daily_outreach: false,
  shadow_mode: true,
};

/** Fecho forçado por ambiente. `CAROLOS_JOBS_ENABLED=false` num preview mantém
 *  os trabalhos parados mesmo que a bandeira esteja aberta em produção. */
const ENV_KILL: Partial<Record<FlagKey, string>> = {
  background_jobs: 'CAROLOS_JOBS_ENABLED',
  external_send: 'CAROLOS_EXTERNAL_SEND_ENABLED',
  ai_enabled: 'CAROLOS_AI_ENABLED',
  gmail_ingestion: 'CAROLOS_GMAIL_ENABLED',
};

const envAllows = (key: FlagKey) => {
  const name = ENV_KILL[key];
  if (!name) return true;
  return process.env[name] !== 'false';
};

export function readFlags(stored: unknown): Flags {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FLAGS };
  for (const key of FLAG_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
    if (!envAllows(key)) out[key] = false;
  }
  return out;
}

/** Uma tarefa de IA precisa da bandeira geral E da sua própria. Sem isso, virar
 *  `ai_enabled` sozinho ligava tudo de uma vez. */
export const aiTaskEnabled = (flags: Flags, task: 'ai_classification' | 'ai_drafting') =>
  flags.ai_enabled && flags[task];
