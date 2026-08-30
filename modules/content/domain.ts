/** A parte pura da inteligência criativa: papéis no funil, competências e a
 *  shot list. Separada do serviço para o planeador de roteiro, que corre no
 *  browser, não arrastar o cliente de base de dados atrás. */

export const FUNNEL_ROLES = ['DISCOVERY', 'CONSIDERATION', 'DECISION'] as const;
export type FunnelRole = (typeof FUNNEL_ROLES)[number];

export const FUNNEL_LABEL: Record<FunnelRole, string> = {
  DISCOVERY: 'Descoberta',
  CONSIDERATION: 'Consideração',
  DECISION: 'Decisão',
};

export const FUNNEL_NOTE: Record<FunnelRole, string> = {
  DISCOVERY: 'Interrompe o scroll e cria curiosidade sobre um problema.',
  CONSIDERATION: 'Compara, demonstra e mostra o produto a resolver.',
  DECISION: 'Responde à objeção que ainda trava a compra.',
};

/** Competências que uma peça demonstra. É o que permite escolher o exemplo
 *  certo para um lead em vez de mandar o portfólio inteiro. */
export const CAPABILITIES = [
  'demo', 'before_after', 'saas_app', 'home_tech', 'pet_tech', 'objection',
  'testimonial', 'humor', 'storytelling', 'talking_head', 'voice_over',
  'b_roll', 'english_scripted', 'unboxing', 'routine', 'asmr',
] as const;

export const CAPABILITY_LABEL: Record<string, string> = {
  demo: 'Demonstração',
  before_after: 'Antes/depois',
  saas_app: 'SaaS ou app',
  home_tech: 'Home tech',
  pet_tech: 'Pet tech',
  objection: 'Objeção',
  testimonial: 'Testemunho',
  humor: 'Humor',
  storytelling: 'Storytelling',
  talking_head: 'Talking head',
  voice_over: 'Voice-over',
  b_roll: 'B-roll',
  english_scripted: 'Inglês com guião',
  unboxing: 'Unboxing',
  routine: 'Rotina',
  asmr: 'ASMR',
};

export type Shot = { shot: string; note?: string; required?: boolean };

export type ContentRow = {
  id: string;
  collaborationId: string | null;
  brandId: string | null;
  brandName: string;
  title: string;
  hypothesis: string;
  funnelRole: FunnelRole | null;
  format: string;
  hook: string;
  coreMessage: string;
  cta: string;
  emotion: string;
  capabilities: string[];
  language: string;
  script: string;
  shotList: Shot[];
  status: string;
  mediaItemId: string | null;
  portfolioPermission: boolean | null;
  publishedAt: string | null;
};

/** Shot list a partir do guião: uma linha por cena, com marcação das tomadas
 *  obrigatórias — as que o briefing exige e que só se dá pela falta depois de
 *  o produto já ter voltado para a caixa.
 *
 *  ponytail: um parser de guião a sério é outra coisa; isto resolve o caso
 *  real, que é a Carol escrever cenas separadas por linha antes de gravar. */
export function shotListFromScript(script: string, mandatory: readonly string[] = []): Shot[] {
  return script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3)
    .map((line) => {
      const clean = line.replace(/^[-*\d.)\s]+/, '');
      return {
        shot: clean,
        required: mandatory.some((m) => clean.toLowerCase().includes(m.toLowerCase())),
      };
    });
}
