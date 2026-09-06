/** O guia do Content Brain, em regras puras.
 *
 *  A feature tem profundidade e a Carol nunca a usou. O guia existe para
 *  ensinar UMA coisa: ela não precisa saber operar o sistema inteiro, precisa
 *  responder à próxima coisa que o CarolOS pede dela.
 *
 *  Aqui vive só o que se pode testar sem browser: a versão, o estado
 *  persistido, quando o convite da primeira visita aparece e como se anda
 *  entre as etapas. O texto das etapas vive no componente, onde o teste de
 *  voz do produto o alcança.
 *
 *  Puro. Sem base de dados, sem React. */

/** Sobe só quando o fluxo muda de forma substancial. Um deploy não conta:
 *  reoferecer o guia a cada publicação é o que faz um convite virar ruído. */
export const CONTENT_BRAIN_GUIDE_VERSION = 1;

/** Oito etapas de ensino mais a tela de fecho. O contador na barra conta só
 *  as oito — «9 de 8» seria mentira, e a última não ensina nada, despede-se. */
export const GUIDE_STEPS = [
  'what',
  'day',
  'tell',
  'confirm',
  'workshop',
  'record',
  'learn',
  'nothing',
  'ready',
] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number];

export const TEACHING_STEPS = 8;

export type GuideState = {
  version: number;
  lastStep: number;
  dismissedAt: string | null;
  completedAt: string | null;
};

const inteiro = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback;

const texto = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

/** Lê o valor salvo. Devolve `null` quando não há estado nenhum — que é
 *  diferente de estado vazio: um é «nunca abriu», o outro seria «abriu e não
 *  aconteceu nada», e só o primeiro autoriza o convite. */
export function readGuideState(value: unknown): GuideState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version === undefined) return null;
  return {
    version: inteiro(v.version, 0),
    lastStep: clampStep(inteiro(v.lastStep, 0)),
    dismissedAt: texto(v.dismissedAt),
    completedAt: texto(v.completedAt),
  };
}

export const clampStep = (i: number) => Math.min(Math.max(i, 0), GUIDE_STEPS.length - 1);

export const nextGuideStep = (i: number) => clampStep(i + 1);
export const prevGuideStep = (i: number) => clampStep(i - 1);

export const isFirstGuideStep = (i: number) => i <= 0;
export const isLastGuideStep = (i: number) => i >= GUIDE_STEPS.length - 1;

/** A barra enche ao longo das oito etapas e fica cheia no fecho. */
export const guidePercent = (i: number) =>
  Math.round((Math.min(clampStep(i) + 1, TEACHING_STEPS) / TEACHING_STEPS) * 100);

/** O convite da primeira visita.
 *
 *  Aparece enquanto não houver registo desta versão. Começar, fechar ou dizer
 *  «agora não» escrevem estado, e qualquer um deles cala o convite — nunca se
 *  interrompe duas vezes quem já respondeu uma. */
export function shouldOfferFirstRun(
  state: GuideState | null,
  version = CONTENT_BRAIN_GUIDE_VERSION,
): boolean {
  if (!state) return true;
  return state.version < version;
}

/** Onde reabrir o guia. Uma versão nova, ou um guia já concluído, recomeçam
 *  do princípio: retomar na etapa 6 de um fluxo que mudou não ensina nada. */
export function resumeGuideStep(
  state: GuideState | null,
  version = CONTENT_BRAIN_GUIDE_VERSION,
): number {
  if (!state || state.version !== version || state.completedAt) return 0;
  return clampStep(state.lastStep);
}

/** O que se escreve depois de cada interação. Merge explícito e não parcial:
 *  a versão vai sempre junto, senão um passo salvo numa versão antiga ficava
 *  a valer para a nova. */
export function guidePatch(input: {
  current: GuideState | null;
  step?: number;
  dismissedAt?: string | null;
  completedAt?: string | null;
  version?: number;
}): GuideState {
  const version = input.version ?? CONTENT_BRAIN_GUIDE_VERSION;
  const base = input.current && input.current.version === version ? input.current : null;
  return {
    version,
    lastStep: clampStep(input.step ?? base?.lastStep ?? 0),
    dismissedAt: input.dismissedAt !== undefined ? input.dismissedAt : (base?.dismissedAt ?? null),
    completedAt: input.completedAt !== undefined ? input.completedAt : (base?.completedAt ?? null),
  };
}
