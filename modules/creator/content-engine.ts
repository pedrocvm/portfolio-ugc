/** O motor que aplica a mentoria a uma ideia concreta.
 *
 *  `mentor-playbook.ts` diz o que a mentora ensinou. Isto é o que decide, caso
 *  a caso: que função tem esta ideia, que modo, se mostra o que está por trás,
 *  se os três ganchos existem, se a história tem herói, vilão e guia, se o
 *  remate serve para público frio, e se o nicho é dela.
 *
 *  Tudo o que sai daqui fica no motor. A Carol não vê «FUNCTION_FIT 72»: vê
 *  «por que escolhi isto».
 *
 *  Puro. Sem base de dados, sem modelo. */

import { guruProblems, genericProblems, similarity } from './domain';
import {
  CONTENT_FUNCTIONS,
  EDITORIAL_MODES,
  FUNCTION_SPEC,
  INITIAL_FUNCTION_FOCUS,
  MODE_SPEC,
  REELS_TEST_POLICY,
  STORY_SECTIONS,
  WRITTEN_HOOK_TYPES,
  isContentFunction,
  isEditorialMode,
  type ContentFunction,
  type EditorialMode,
  type HookChannel,
  type StorySection,
  type WrittenHookType,
} from './mentor-playbook';

export type IdeaText = {
  title?: string;
  hook?: string;
  script?: string;
  caption?: string;
  cta?: string;
  objective?: string;
  format?: string;
  onScreenText?: readonly string[];
};

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const textOf = (t: IdeaText) =>
  plain([t.title, t.hook, t.script, t.caption, t.cta, t.objective, t.format, ...(t.onScreenText ?? [])].filter(Boolean).join(' '));

const hits = (text: string, res: readonly RegExp[]) => res.filter((re) => re.test(text)).length;

/* ── Eixo 1: função ───────────────────────────────────────────────────────── */

const FUNCTION_MARKS: Record<ContentFunction, readonly RegExp[]> = {
  attract_connect: [
    /\b(rotina|namorado|casa|braga|porto|paraiba|brasileira|sotaque|larguei|restaurante|sala|turno)\b/,
    /\b(humor|piada|emburrad\w*|ironia|mais alguem|quem (tambem|nunca)|identific\w*|a gente)\b/,
    /\b(cafe|treino|academia|pele|rosacea|cabelo|domingo|fim de semana|vida)\b/,
    /\b(descob\w*|alcance|conex\w*|conectar|atrair|atracao|seguidor\w*|publico frio)\b/,
  ],
  educate_retain: [
    /\b(salva|salvar|guarda isso|aprend\w*|dica|dicas|passo|truque)\b/,
    /\b(luz|ilumina\w*|edicao|editar|capcut|corte|angulo|camera|enquadr\w*|setup|transic\w*|timeline|take)\b/,
    /\b(mudei|ajust\w*|antes e depois|antes\/depois|bruto|final|processo|tecnica|como eu (fiz|faco|gravei|editei))\b/,
    /\b(util|educ\w*|ensin\w*|reten\w*|informa\w*|salvamento\w*)\b/,
  ],
  convert: [
    /\b(marca|marcas|brief|cliente|contrat\w*|portfolio|campanha|orcamento|proposta)\b/,
    /\b(entreg\w*|aprov\w*|feedback|resultado|essencia|o que a marca)\b/,
    /\b(autorid\w*|prova|competenc\w*|converter|conversao|vitrine)\b/,
  ],
};

/** Que função tem uma ideia, a partir do que ela diz.
 *
 *  Quando o modelo já declarou a função, ela ganha — isto é o fallback para o
 *  histórico antigo e para o que ela pergunta à Carol AI: «isto é atração ou
 *  conversão?». */
export function inferFunction(idea: IdeaText & { declared?: string | null }): ContentFunction {
  if (idea.declared && isContentFunction(idea.declared)) return idea.declared;
  const text = textOf(idea);
  const objetivo = plain(idea.objective ?? '');

  const scores = CONTENT_FUNCTIONS.map((f) => ({ f, n: hits(text, FUNCTION_MARKS[f]) }));
  // O objetivo declarado pesa mais do que o guião: é o que o modelo quis.
  for (const s of scores) {
    if (s.f === 'convert' && /\b(autorid\w*|marca\w*|prova|converter|conversao)\b/.test(objetivo)) s.n += 2;
    if (s.f === 'educate_retain' && /\b(salv\w*|util\w*|educ\w*|ensin\w*|reten\w*)\b/.test(objetivo)) s.n += 2;
    if (s.f === 'attract_connect' && /\b(descob\w*|alcance|conex\w*|identific\w*|comunidade|atra\w*)\b/.test(objetivo)) s.n += 2;
  }
  scores.sort((a, b) => b.n - a.n);
  return scores[0].n === 0 ? 'attract_connect' : scores[0].f;
}

/* ── Eixo 2: modo ─────────────────────────────────────────────────────────── */

const MODE_MARKS: Record<EditorialMode, readonly RegExp[]> = {
  authority: [/\b(brief|marca|cliente|take|edicao|bastidor\w*|processo|decid\w*|escolhi|entreg\w*|aprov\w*|10 anos|dez anos)\b/],
  entertainment: [/\b(humor|piada|emburrad\w*|ironia|mais alguem|rir|riu|engrac\w*|reacao|quem nunca|todo mundo)\b/],
  information: [/\b(dica|dicas|como|passo|mudei|ajust\w*|luz|ilumina\w*|corte|capcut|antes e depois|antes\/depois|aprend\w*|isto e o que|foi isto que)\b/],
  personal: [/\b(namorado|casa|familia|rotina|jornada|larguei|brasileira|primeir[oa] (cliente|marca|vez)|sotaque|domingo|vida)\b/],
};

export function inferModes(idea: IdeaText & { declared?: readonly string[] | null }): EditorialMode[] {
  const declared = (idea.declared ?? []).filter(isEditorialMode);
  if (declared.length) return [...new Set(declared)].slice(0, 2);
  const text = textOf(idea);
  return EDITORIAL_MODES.map((m) => ({ m, n: hits(text, MODE_MARKS[m]) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((x) => x.m);
}

/* ── Equilíbrio ───────────────────────────────────────────────────────────── */

const FUNCTION_MISSING_PHRASE: Record<ContentFunction, string> = {
  attract_connect: 'Hoje falta conexão.',
  educate_retain: 'Hoje falta algo útil que se salve.',
  convert: 'Hoje falta mostrar o ofício para as marcas.',
};

/** O que está em falta face aos alvos, olhando para o que saiu mesmo.
 *
 *  Com pouco histórico não se inventa um desequilíbrio: sugere-se o foco de
 *  arranque que a mentora pediu (informação), e diz-se porquê. */
export function functionBalance(
  history: readonly { contentFunction: string | null }[],
  opts: { minSample?: number } = {},
): { shares: Record<ContentFunction, number>; suggest: ContentFunction; missing: ContentFunction | null; because: string; counted: number } {
  const contados = history.map((h) => h.contentFunction).filter((f): f is ContentFunction => Boolean(f) && isContentFunction(f as string));
  const total = contados.length;
  const shares = {} as Record<ContentFunction, number>;
  for (const f of CONTENT_FUNCTIONS) shares[f] = total ? contados.filter((c) => c === f).length / total : 0;

  const min = opts.minSample ?? 3;
  if (total < min) {
    return {
      shares,
      suggest: INITIAL_FUNCTION_FOCUS,
      missing: null,
      because: `Ainda há pouco publicado (${total}) para falar em equilíbrio. A mentora pediu para começar por ${FUNCTION_SPEC[INITIAL_FUNCTION_FOCUS].label.toLowerCase()}.`,
      counted: total,
    };
  }

  const debt = CONTENT_FUNCTIONS.map((f) => ({ f, d: FUNCTION_SPEC[f].targetShare - shares[f] })).sort((a, b) => b.d - a.d);
  const top = debt[0];
  const missing = top.d > 0.1 ? top.f : null;
  return {
    shares,
    suggest: top.f,
    missing,
    because: missing
      ? `${FUNCTION_MISSING_PHRASE[missing]} Das últimas ${total}, ${Math.round(shares[missing] * 100)}% foram de ${FUNCTION_SPEC[missing].label.toLowerCase()}; o alvo é ${Math.round(FUNCTION_SPEC[missing].targetShare * 100)}%.`
      : 'As três funções estão em dia.',
    counted: total,
  };
}

const MODE_MISSING_PHRASE: Record<EditorialMode, string> = {
  authority: 'Falta mostrar que ela sabe o que faz.',
  entertainment: 'Falta respiro: algo leve em que o público se reconheça.',
  information: 'Falta algo acionável.',
  personal: 'Falta a vida dela: casa, rotina, a jornada.',
};

export function modeBalance(
  history: readonly { modes: readonly string[] }[],
  opts: { minSample?: number } = {},
): { shares: Record<EditorialMode, number>; missing: EditorialMode | null; because: string } {
  const min = opts.minSample ?? 3;
  const rows = history.filter((h) => h.modes.some(isEditorialMode));
  const shares = {} as Record<EditorialMode, number>;
  for (const m of EDITORIAL_MODES) shares[m] = rows.length ? rows.filter((h) => h.modes.includes(m)).length / rows.length : 0;
  if (rows.length < min) return { shares, missing: null, because: 'Ainda há pouco publicado para medir o equilíbrio dos modos.' };

  const ordenados = [...EDITORIAL_MODES].sort((a, b) => shares[a] - shares[b]);
  const menor = ordenados[0];
  // Um modo que não aparece em nenhuma das últimas peças está em falta. Um que
  // aparece em uma de dez, também.
  const missing = shares[menor] <= 0.1 ? menor : null;
  return {
    shares,
    missing,
    because: missing ? `${MODE_MISSING_PHRASE[missing]} ${MODE_SPEC[missing].label} não apareceu nas últimas ${rows.length}.` : 'Os quatro modos estão em dia.',
  };
}

/* ── A lente: está mostrando o que está por trás? ─────────────────────────── */

export const CRAFT_SIGNALS = ['process', 'reasoning', 'choice', 'backstage', 'competence'] as const;
export type CraftSignal = (typeof CRAFT_SIGNALS)[number];

const CRAFT_MARKS: Record<CraftSignal, RegExp> = {
  process: /\b(processo|como eu (fiz|faco|gravei|editei|escolhi)|passo a passo|por tras|bastidor\w*|making of|antes de gravar|pesquis\w*|preparei)\b/,
  reasoning: /\b(porque|por que|decid\w*|raciocin\w*|a razao|o motivo|percebi|entendi|reparei|o problema era)\b/,
  choice: /\b(escolhi|troquei|mudei|descartei|ficou (este|esse)|ficaram com|em vez de|preferi|cortei|refiz|quase (mandei|descartei|apaguei))\b/,
  backstage: /\b(brief|take|tomada|timeline|corte|luz|ilumina\w*|tripe|setup|gravacao|edicao|capcut|bruto|final|ring light|enquadr\w*)\b/,
  competence: /\b(a marca (pediu|aprovou|ficou|escolheu)|o brief|entreguei|aprovad\w*|10 anos|dez anos|de sala|de restaurante|essencia)\b/,
};

/** A pergunta da mentora, respondida por sinais. */
export function proofOfCraft(idea: IdeaText): { present: boolean; signals: CraftSignal[]; score: number; because: string } {
  const text = textOf(idea);
  const signals = CRAFT_SIGNALS.filter((s) => CRAFT_MARKS[s].test(text));
  const score = Math.min(100, signals.length * 25);
  const present = signals.length >= 2;
  return {
    present,
    signals,
    score,
    because: present
      ? `Mostra o que está por trás: ${signals.length} sinais (${signals.join(', ')}).`
      : 'Não mostra o que está por trás: não há processo, raciocínio nem escolha à vista.',
  };
}

/** Uma ideia de autoridade ou conversão sem bastidor vale menos. Aplica-se
 *  ao score do motor, nunca à frase que ela vê. */
export function craftAdjustedScore(input: { score: number; contentFunction: ContentFunction; craft: { present: boolean } }): number {
  if (input.craft.present) return input.score;
  if (input.contentFunction === 'convert') return Math.round(input.score * 0.7);
  return input.score;
}

/* ── Educar sem virar professora ──────────────────────────────────────────── */

const EDUCATION_MARKS = /\b(luz|ilumina\w*|edicao|editar|capcut|corte|angulo|camera|enquadr\w*|setup|transic\w*|grav\w*|template\w*|ritmo|audio)\b/;
const TIPS_LIST = /^\s*\d+\s+(transic\w*|tecnic\w*|truque\w*|efeito\w*|template\w*|apps?|ferramenta\w*)\b|^\s*\d+\s+\w+ que (voce|vc|tu|todo (creator|mundo)) precisa/;

export type EducationVerdict = 'proof_of_craft' | 'tips' | 'guru' | 'not_education';

/** O que a mentora pediu (conteúdo técnico) sem o que a auditoria proíbe
 *  (aula). A resolução é a prova de ofício: a decisão real num vídeo real. */
export function educationVerdict(idea: IdeaText): { verdict: EducationVerdict; because: string } {
  const hook = idea.hook ?? '';
  if (
    TIPS_LIST.test(plain(hook)) ||
    guruProblems({ hook, title: idea.title, script: idea.script }).length ||
    genericProblems({ hook, title: idea.title, script: idea.script }).some((p) => p.includes('lugar-comum'))
  ) {
    return { verdict: 'guru', because: 'Põe-na a dar aula. «5 dicas de iluminação» é conteúdo de guru, não dela.' };
  }
  const text = textOf(idea);
  if (!EDUCATION_MARKS.test(text)) return { verdict: 'not_education', because: 'Não é conteúdo educativo.' };
  const craft = proofOfCraft(idea);
  if (craft.present) {
    return { verdict: 'proof_of_craft', because: 'Educa mostrando a decisão num trabalho real — bruto, ajuste, final.' };
  }
  return { verdict: 'tips', because: 'Educa em abstrato. Sem o take, a decisão e o antes/depois, é uma dica genérica.' };
}

/* ── Os três ganchos ──────────────────────────────────────────────────────── */

export type Hooks = { visual?: string | null; written?: string | null; spoken?: string | null };

/** Nem todo vídeo tem fala. O que se exige é que a escolha seja consciente:
 *  `needsSpeech` diz se este formato fala. */
export function hooksCompleteness(
  hooks: Hooks,
  opts: { needsSpeech?: boolean } = {},
): { complete: boolean; missing: HookChannel[]; redundant: boolean; because: string } {
  const has = (v?: string | null) => Boolean(v && v.trim().length >= 6);
  const needsSpeech = opts.needsSpeech ?? true;
  const missing: HookChannel[] = [];
  if (!has(hooks.visual)) missing.push('visual');
  if (!has(hooks.written)) missing.push('written');
  if (needsSpeech && !has(hooks.spoken)) missing.push('spoken');

  // Os três dizem coisas diferentes. Escrito igual ao falado é um gancho só.
  const redundant = has(hooks.written) && has(hooks.spoken) && similarity(hooks.written!, hooks.spoken!) >= 0.8;

  const complete = missing.length === 0 && !redundant;
  const because = complete
    ? needsSpeech
      ? 'Os três ganchos existem e dizem coisas diferentes.'
      : 'Olho e leitura prendem; o vídeo não fala, e isso é uma escolha.'
    : redundant
      ? 'O gancho escrito repete o falado: é um gancho só, dito duas vezes.'
      : `Falta ${missing.map((m) => ({ visual: 'o gancho visual', written: 'o gancho escrito', spoken: 'o gancho falado' })[m]).join(' e ')}.`;

  return { complete, missing, redundant, because };
}

const WRITTEN_MARKS: Record<WrittenHookType, RegExp> = {
  emotion: /\b(odeio|amo|medo|chorei|vergonha|irritad\w*|emburrad\w*|assust\w*|nunca imaginei|orgulho|cansad\w*|terror|panico|alivio)\b|!$/,
  update: /\b(primeir[oa]|hoje|agora|acabei de|nov[oa]|esta semana|finalmente|chegou|comecei|acabou de)\b/,
  teaching: /\b(como|o que (eu )?mudei|erro|dica|aprendi|isto e o que|foi isto que|por que|percebi que|o segredo)\b/,
  identification: /\b(voce|vc|quem (tambem|nunca|ja)|mais alguem|se voce|todo mundo|a gente|ninguem te|todo creator)\b/,
  experience: /\b(eu|minha|meu|passei|aconteceu|comigo|anos|larguei|quando eu|demorei|quase)\b/,
};

const TIE_ORDER: readonly WrittenHookType[] = ['emotion', 'update', 'teaching', 'identification', 'experience'];

/** Que tipo de gancho escrito é este. Os cinco da mentora; `null` quando não
 *  há marca nenhuma — o que costuma querer dizer que o gancho é fraco. */
export function classifyWrittenHook(text: string): WrittenHookType | null {
  const t = plain(text.trim());
  if (!t) return null;
  const scored = WRITTEN_HOOK_TYPES.map((k) => ({ k, n: (t.match(WRITTEN_MARKS[k]) ?? []).length }));
  const best = [...scored].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n === 0) return null;
  // Empate resolve-se por especificidade: «nunca imaginei que a minha casa» é
  // emoção antes de ser biografia, e quase todo gancho tem um «eu» lá dentro.
  const empatados = scored.filter((s) => s.n === best.n).map((s) => s.k);
  return TIE_ORDER.find((k) => empatados.includes(k)) ?? empatados[0];
}

/* ── Herói, vilão, guia ───────────────────────────────────────────────────── */

export type Story = { hero?: string | null; villain?: string | null; guide?: string | null };

/** O que reprova uma história. O erro clássico — e o único que a mentora
 *  nomeou — é o vilão ser a concorrência. */
export function storyProblems(story: Story): string[] {
  const out: string[] = [];
  const hero = plain(story.hero ?? '');
  const villain = plain(story.villain ?? '');
  const guide = plain(story.guide ?? '');

  if (!hero.trim()) out.push('sem herói: quem tem o problema?');
  else if (/\b(carol|eu mesma|a criadora|a propria)\b/.test(hero)) out.push('a heroína é quem vê, não ela');

  if (!villain.trim()) out.push('sem vilão: qual é o problema?');
  else if (/\b(concorr\w*|outra marca|marca rival|empresa rival|outros? creators?|outras? creators?|a marca [A-Z]\w*)\b/i.test(story.villain ?? '')) {
    out.push('o vilão é a concorrência — o vilão é o problema');
  }

  if (!guide.trim()) out.push('sem guia: quem mostra o caminho?');

  return out;
}

export type StoryOutline = Partial<Record<StorySection, string | null>>;

/** O que ela vê no roteiro: gancho, problema, desenvolvimento, prova, payoff,
 *  remate. Herói e vilão ficam no motor. */
export function outlineProblems(outline: StoryOutline, opts: { needsCta?: boolean } = {}): string[] {
  const out: string[] = [];
  const has = (k: StorySection) => Boolean(outline[k] && outline[k]!.trim().length > 0);
  for (const k of ['hook', 'problem', 'proof', 'payoff'] as const) {
    if (!has(k)) out.push(`sem ${({ hook: 'gancho', problem: 'problema', proof: 'prova', payoff: 'payoff' })[k]}`);
  }
  if ((opts.needsCta ?? true) && !has('cta')) out.push('sem remate');
  return out;
}

export const storySections = (): readonly StorySection[] => STORY_SECTIONS;

/* ── O remate ─────────────────────────────────────────────────────────────── */

const CTA_COLD_AVOID = /\b(contrat\w*|orcament\w*|link na bio|manda (mensagem|dm)|chama no|whatsapp|proposta|compr(a|e|ar)|desconto|cupom|agenda\w*|reserva\w*)\b/;
const CTA_PREFERRED = /\b(segue|seguir|salva|salvar|guarda|comenta|comentar|conta|diz|responde|marca alguem)\b/;

/** O remate certo para quem está vendo pela primeira vez. */
export function ctaVerdict(
  cta: string | null | undefined,
  audience: 'cold' | 'warm',
): { ok: boolean; because: string; suggest: string | null } {
  const t = plain(cta ?? '').trim();
  if (!t) {
    return {
      ok: audience === 'warm',
      because: audience === 'cold' ? 'Sem remate. Para público frio, um pedido simples chega.' : 'Sem remate.',
      suggest: audience === 'cold' ? 'Salva isso.' : null,
    };
  }
  if (audience === 'cold' && CTA_COLD_AVOID.test(t)) {
    return {
      ok: false,
      because: `«${cta!.trim()}» pede demais a quem nunca a viu. No teste, o remate é ${REELS_TEST_POLICY.cta.preferred.join(', ')}.`,
      suggest: 'Segue pra ver o que eu faço com isso.',
    };
  }
  if (audience === 'cold' && !CTA_PREFERRED.test(t)) {
    return { ok: true, because: 'Remate aceitável, mas não pede nada. Seguir ou salvar convertem melhor no frio.', suggest: 'Salva isso.' };
  }
  return { ok: true, because: 'Remate simples, do tamanho de quem está vendo.', suggest: null };
}

/* ── Nicho: comercial não é orgânico ──────────────────────────────────────── */

export type Territory = {
  commercial: 'priority' | 'not_priority' | 'excluded';
  organic: 'core' | 'experimental' | 'deprioritized';
  because: string;
};

/** O que é nicho de prospecção e o que é território de conteúdo são duas
 *  coisas. Skincare está fora das duas como categoria; a pele real dela
 *  continua como história. Maquiagem e moda testam-se; não vendem sozinhos. */
export function nicheTerritory(text: string): Territory {
  const t = plain(text);
  if (/\b(skincare|skin care|haircare|hair care|rotina de (pele|skincare)|dermocosm\w*|serum|hidratante|shampoo|condicionador)\b/.test(t)) {
    return {
      commercial: 'excluded',
      organic: 'deprioritized',
      because:
        'Skincare está fora da estratégia como nicho — decisão do negócio, confirmada na mentoria. A pele real dela (rosácea, clima) continua como história pessoal, não como rotina de beleza.',
    };
  }
  if (/\b(maquiagem|makeup|make|moda|look|outfit|estetic\w*|estilo)\b/.test(t)) {
    return {
      commercial: 'not_priority',
      organic: 'experimental',
      because: 'Maquiagem e moda são território orgânico experimental: testa-se em poucas peças, sem virar prioridade comercial.',
    };
  }
  if (/\b(tech|tecnolog\w*|app|apps|saas|software|robo|aspirador|gadget\w*|smart|dispositivo\w*|ferramenta\w*)\b/.test(t)) {
    return {
      commercial: 'priority',
      organic: 'core',
      because: 'Tecnologia para o lar é o nicho comercial. No feed entra quando também é um episódio da vida dela.',
    };
  }
  if (/\b(restaurante\w*|sala|braga|hospitalidade|servico|hotel\w*|cafe|pizzaria)\b/.test(t)) {
    return {
      commercial: 'priority',
      organic: 'core',
      because: 'Hospitalidade é o olhar dela e um nicho que paga: restauração, hotelaria, software de operação local.',
    };
  }
  return { commercial: 'not_priority', organic: 'core', because: 'Território orgânico dela; comercialmente não é prioridade.' };
}

/* ── O rasto de uma recomendação ──────────────────────────────────────────── */

export type DecisionTrace = {
  whyRecommended: string;
  strategyRulesUsed: string[];
  referencesUsed: string[];
  performanceSignalsUsed: string[];
  assetsAvailable: string[];
  playbookVersion: string;
  strategyVersion: string;
};

/** Um rótulo curto por função, para o «por que escolhi». */
export const FUNCTION_LABEL: Record<ContentFunction, string> = {
  attract_connect: FUNCTION_SPEC.attract_connect.label,
  educate_retain: FUNCTION_SPEC.educate_retain.label,
  convert: FUNCTION_SPEC.convert.label,
};
