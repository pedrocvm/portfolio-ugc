/** O Reels Test Lab, na parte que é regra.
 *
 *  A mentora define o Reels Test como conteúdo de atração para público frio.
 *  Daí sai tudo o resto: o que é elegível, o formato de B-roll, o remate, a
 *  proteção contra duplicados, e quando é que um teste merece ir para o feed.
 *
 *  Os números que ela citou — 300 é fraco, 2000 vale analisar, 3000 estável
 *  vai para o feed — ficam aqui como heurísticas. Assim que a Carol tiver uma
 *  linha de base real, é a linha de base que decide.
 *
 *  Puro. */

import { similarity } from './domain';
import { classifyWrittenHook, ctaVerdict } from './content-engine';
import { PERFORMANCE_HEURISTICS, REELS_TEST_POLICY, type ContentFunction } from './mentor-playbook';

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ── Elegibilidade ────────────────────────────────────────────────────────── */

export const TEST_CRITERIA = [
  'universality',
  'coldAudienceComprehension',
  'hook',
  'shortness',
  'relatability',
  'repeatability',
] as const;
export type TestCriterion = (typeof TEST_CRITERIA)[number];

export type TestCandidateInput = {
  contentFunction: ContentFunction | string | null;
  durationSeconds: number | null;
  hook: string;
  script?: string;
  caption?: string;
  cta?: string | null;
  format?: string;
  modes?: readonly string[];
  requiresContext?: boolean;
  usesExistingAsset?: boolean;
};

export type TestVerdict = {
  eligible: boolean;
  recommendation: 'reels_test_first' | 'feed' | 'not_for_test';
  score: number;
  criteria: Record<TestCriterion, number>;
  because: string;
};

const CONTEXT_MARKS = /\b(a marca|o brief|esta marca|essa marca|cliente|como eu disse|no video anterior|episodio|parte 2|continuando|voces lembram)\b/;
const UNIVERSAL_MARKS = /\b(rotina|trabalho|casa|cafe|treino|pele|cabelo|cansad\w*|segunda|domingo|dinheiro|tempo|celular|editando|digitando)\b/;
const JARGON = /\b(ugc|brief|b-roll|broll|hook|deliverable|retainer|whitelisting|cpm|roas)\b/g;
const TENSION = /\b(quase|nunca|ninguem|erro|demorei|odiava|ate que|depois de|meses|anos|parou|descobri|percebi|mandei)\b/;

/** «Eu testaria isto primeiro em Reels Test.» Ou não. */
export function reelsTestEligibility(i: TestCandidateInput): TestVerdict {
  const text = plain([i.hook, i.script ?? '', i.caption ?? ''].join(' '));
  const criteria = {} as Record<TestCriterion, number>;

  const dur = i.durationSeconds;
  criteria.shortness = dur === null ? 50 : dur <= 7 ? 100 : dur <= 15 ? 75 : dur <= 30 ? 45 : 15;

  criteria.universality = (CONTEXT_MARKS.test(text) ? 25 : 85) + (UNIVERSAL_MARKS.test(text) ? 15 : 0);

  const jargao = (text.match(JARGON) ?? []).length;
  criteria.coldAudienceComprehension = Math.max(0, (i.requiresContext ? 20 : 80) - jargao * 15);

  const hook = i.hook.trim();
  criteria.hook = hook.length < 15 ? 20 : hook.length <= 110 && TENSION.test(plain(hook)) ? 85 : 55;

  const tipo = classifyWrittenHook(hook);
  criteria.relatability =
    (tipo === 'identification' || tipo === 'experience' || tipo === 'emotion' ? 80 : 50) +
    ((i.modes ?? []).some((m) => m === 'personal' || m === 'entertainment') ? 10 : 0);

  const formato = plain(i.format ?? '');
  criteria.repeatability = i.usesExistingAsset
    ? 90
    : /b-?roll|montagem|voice ?over/.test(formato)
      ? 80
      : /talking ?head|falad/.test(formato)
        ? 45
        : /heavy|pesad/.test(formato)
          ? 20
          : 50;

  for (const k of TEST_CRITERIA) criteria[k] = Math.max(0, Math.min(100, criteria[k]));

  const score = Math.round(
    criteria.universality * 0.2 +
      criteria.coldAudienceComprehension * 0.2 +
      criteria.hook * 0.2 +
      criteria.shortness * 0.15 +
      criteria.relatability * 0.15 +
      criteria.repeatability * 0.1,
  );

  // Conversão nunca vai para teste. Não é uma nota baixa: é um não.
  if (i.contentFunction === 'convert') {
    return {
      eligible: false,
      recommendation: 'feed',
      score,
      criteria,
      because: `${REELS_TEST_POLICY.purpose} Uma peça de conversão vai para o feed normal, onde quem vê já a conhece.`,
    };
  }

  const remate = ctaVerdict(i.cta, 'cold');
  if (!remate.ok && (i.cta ?? '').trim()) {
    return { eligible: false, recommendation: 'feed', score, criteria, because: remate.because };
  }

  const eligible = score >= 60 && criteria.coldAudienceComprehension >= 40;
  return {
    eligible,
    recommendation: eligible ? 'reels_test_first' : score >= 40 ? 'feed' : 'not_for_test',
    score,
    criteria,
    because: eligible
      ? `Eu testaria isto primeiro em Reels Test: ${
          [
            criteria.universality >= 80 ? 'não precisa de contexto' : '',
            criteria.shortness >= 75 ? 'é curto' : '',
            criteria.repeatability >= 80 ? 'reaproveita o que já existe' : '',
            criteria.hook >= 85 ? 'o gancho tem tensão' : '',
          ]
            .filter(Boolean)
            .join(', ') || 'serve para quem nunca a viu'
        }.`
      : criteria.coldAudienceComprehension < 40
        ? 'Precisa de contexto que o público frio não tem. Feed.'
        : `Serve melhor no feed: ${
            [
              criteria.shortness < 45 ? 'é longo para um teste' : '',
              criteria.universality < 50 ? 'depende de quem já a conhece' : '',
              criteria.hook < 55 ? 'o gancho não prende à primeira' : '',
            ]
              .filter(Boolean)
              .join(', ') || 'não é universal o suficiente'
          }.`,
  };
}

/* ── O formato de B-roll ──────────────────────────────────────────────────── */

export type BrollTestSpec = {
  brollSeconds: number | null;
  writtenHook: string | null;
  caption: string | null;
  cta: string | null;
};

/** O que reprova um B-roll test antes de o publicar. */
export function brollTestProblems(spec: BrollTestSpec): string[] {
  const out: string[] = [];
  const { minSeconds, maxSeconds } = REELS_TEST_POLICY.brollFormat;
  if (spec.brollSeconds === null) out.push('sem duração do B-roll');
  else if (spec.brollSeconds < minSeconds || spec.brollSeconds > maxSeconds) {
    out.push(`B-roll de ${spec.brollSeconds}s: o formato pede ${minSeconds} a ${maxSeconds} segundos`);
  }
  if (!spec.writtenHook || spec.writtenHook.trim().length < 10) out.push('sem gancho escrito');
  if (!spec.caption || spec.caption.trim().length < 40) out.push('a legenda tem de entregar o contexto ou a solução');
  const remate = ctaVerdict(spec.cta, 'cold');
  if (!remate.ok) out.push(remate.because);
  return out;
}

/* ── Duplicados ───────────────────────────────────────────────────────────── */

export type Piece = {
  assetIds?: readonly string[];
  hook: string;
  caption?: string | null;
  structure?: string | null;
};

export type DuplicateVerdict = {
  duplicate: boolean;
  same: ('asset' | 'hook' | 'caption' | 'structure')[];
  variantOk: boolean;
  because: string;
};

/** «Quero repostar o mesmo vídeo.» Não igual; uma variante, sim.
 *
 *  A regra da mentora é que o Instagram trava o duplicado exato. Mudar a música
 *  ou a frase é aceitável; mesmo vídeo, mesmo gancho e mesma legenda não é. */
export function duplicateContent(a: Piece, b: Piece): DuplicateVerdict {
  const same: DuplicateVerdict['same'] = [];
  const assetsA = new Set(a.assetIds ?? []);
  if (assetsA.size && (b.assetIds ?? []).some((id) => assetsA.has(id))) same.push('asset');
  if (similarity(a.hook, b.hook) >= 0.7) same.push('hook');
  if (a.caption && b.caption && similarity(a.caption, b.caption) >= 0.7) same.push('caption');
  if (a.structure && b.structure && similarity(a.structure, b.structure) >= 0.6) same.push('structure');

  const duplicate =
    (same.includes('hook') && same.includes('caption')) ||
    (same.includes('asset') && same.includes('hook')) ||
    same.length >= 3;

  return {
    duplicate,
    same,
    variantOk: !duplicate && same.length > 0,
    because: duplicate
      ? `É o mesmo conteúdo outra vez (${same.join(', ')} iguais). O Instagram trava o duplicado. Uma variante legítima muda o gancho, a legenda ou o enquadramento — não só a música.`
      : same.length
        ? `Partilha ${same.join(' e ')} com o anterior, mas muda o suficiente para ser uma variante.`
        : 'Não tem nada em comum com o anterior.',
  };
}

/* ── A linha de base dela ─────────────────────────────────────────────────── */

export type Baseline = { medianViews: number | null; sampleSize: number; confidence: 'none' | 'low' | 'medium' | 'high' };

export function carolBaseline(perfs: readonly { views: number | null }[]): Baseline {
  const views = perfs.map((p) => p.views).filter((v): v is number => typeof v === 'number' && v >= 0).sort((a, b) => a - b);
  const n = views.length;
  if (n < 3) return { medianViews: null, sampleSize: n, confidence: 'none' };
  const median = n % 2 ? views[(n - 1) / 2] : Math.round((views[n / 2 - 1] + views[n / 2]) / 2);
  return { medianViews: median, sampleSize: n, confidence: n < 8 ? 'low' : n < 20 ? 'medium' : 'high' };
}

export type Measurement = {
  views: number | null;
  reach?: number | null;
  nonFollowerReach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  profileVisits?: number | null;
  measuredAt?: string;
};

export type PerformanceVerdict = {
  verdict: 'weak' | 'normal' | 'strong' | 'unknown';
  relativeToBaseline: number | null;
  basis: 'carol_baseline' | 'mentor_heuristic' | 'none';
  engagementPerThousand: number | null;
  nonFollowerShare: number | null;
  because: string;
};

/** Como correu uma peça. A linha de base real ganha à heurística sempre que
 *  existe — 2000 views é «excelente» só para quem costuma ter 300. */
export function evaluatePerformance(
  m: Measurement,
  baseline: Baseline,
  heuristics = PERFORMANCE_HEURISTICS,
): PerformanceVerdict {
  const views = m.views;
  const engagement =
    views && views > 0 ? Math.round((((m.comments ?? 0) * 3 + (m.saves ?? 0) * 2 + (m.shares ?? 0) * 2 + (m.likes ?? 0) * 0.5) / views) * 1000 * 10) / 10 : null;
  const nonFollowerShare = m.reach && m.reach > 0 && typeof m.nonFollowerReach === 'number' ? Math.round((m.nonFollowerReach / m.reach) * 100) / 100 : null;

  if (views === null || views === undefined) {
    return { verdict: 'unknown', relativeToBaseline: null, basis: 'none', engagementPerThousand: engagement, nonFollowerShare, because: 'Sem views registadas.' };
  }

  if (baseline.medianViews && baseline.confidence !== 'none') {
    const ratio = Math.round((views / baseline.medianViews) * 100) / 100;
    const verdict = ratio >= 2 ? 'strong' : ratio <= 0.5 ? 'weak' : 'normal';
    return {
      verdict,
      relativeToBaseline: ratio,
      basis: 'carol_baseline',
      engagementPerThousand: engagement,
      nonFollowerShare,
      because:
        verdict === 'strong'
          ? `${views} views: ${ratio}× o normal dela (${baseline.medianViews}, em ${baseline.sampleSize} peças).`
          : verdict === 'weak'
            ? `${views} views: ${ratio}× o normal dela (${baseline.medianViews}). Fraco para o padrão dela, seja o que for que a mentora chame de bom.`
            : `${views} views: dentro do normal dela (${baseline.medianViews}).`,
    };
  }

  const verdict = views <= heuristics.weakTestMaxViews ? 'weak' : views >= heuristics.worthAnalysingViews ? 'strong' : 'normal';
  return {
    verdict,
    relativeToBaseline: null,
    basis: 'mentor_heuristic',
    engagementPerThousand: engagement,
    nonFollowerShare,
    because:
      verdict === 'strong'
        ? `${views} views. Pela heurística da mentora, vale isolar o que funcionou. Ainda não há linha de base dela para confirmar.`
        : verdict === 'weak'
          ? `${views} views. Pela heurística da mentora, um teste fraco. Sem linha de base dela, é só uma referência.`
          : `${views} views. Nem fraco nem forte pela heurística da mentora; a linha de base dela ainda não existe.`,
  };
}

/* ── Platô e promoção ao feed ─────────────────────────────────────────────── */

export type TimedMeasurement = Measurement & { measuredAt: string };

/** Parou de crescer: menos de 5% entre as duas últimas medições. */
export function plateauDetected(ms: readonly TimedMeasurement[]): { plateau: boolean; at: number | null; velocityPerDay: number | null } {
  const ordenadas = [...ms].filter((x) => typeof x.views === 'number').sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1));
  if (ordenadas.length < 2) return { plateau: false, at: null, velocityPerDay: null };
  const first = ordenadas[0];
  const prev = ordenadas[ordenadas.length - 2];
  const last = ordenadas[ordenadas.length - 1];
  const dias = Math.max(1 / 24, (Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / 86_400_000);
  const velocity = Math.round(((last.views ?? 0) - (first.views ?? 0)) / dias);
  const growth = (prev.views ?? 0) > 0 ? ((last.views ?? 0) - (prev.views ?? 0)) / (prev.views ?? 1) : 1;
  return { plateau: growth < 0.05, at: growth < 0.05 ? (last.views ?? null) : null, velocityPerDay: velocity };
}

export type PromotionVerdict = { candidate: boolean; because: string; headline: string | null; plateauAt: number | null };

/** «Esse teste parou de crescer e ficou bem acima do normal. Eu levaria para
 *  o feed.» A ação é dela: o Instagram não tem API para isto e não se finge. */
export function feedPromotionCandidate(input: {
  measurements: readonly TimedMeasurement[];
  baseline: Baseline;
  promoted: boolean;
}): PromotionVerdict {
  if (input.promoted) return { candidate: false, because: 'Já está no feed.', headline: null, plateauAt: null };
  if (input.measurements.length < 2) {
    return { candidate: false, because: 'Ainda só há uma medição: não dá para saber se parou de crescer.', headline: null, plateauAt: null };
  }
  const p = plateauDetected(input.measurements);
  const last = [...input.measurements].sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : -1))[0];
  const perf = evaluatePerformance(last, input.baseline);

  if (perf.verdict !== 'strong') {
    return { candidate: false, because: `Não ficou acima do normal: ${perf.because}`, headline: null, plateauAt: p.at };
  }
  if (!p.plateau) {
    return { candidate: false, because: 'Ainda está crescendo. Deixa mais um pouco no teste.', headline: null, plateauAt: null };
  }
  return {
    candidate: true,
    because: perf.because,
    headline: 'Esse teste parou de crescer e ficou bem acima do normal. Eu levaria para o feed.',
    plateauAt: p.at,
  };
}

/* ── Quantos testes hoje ──────────────────────────────────────────────────── */

export type LoadInput = {
  intensiveMode: boolean;
  commercialShootsToday: number;
  minutesCommitted: number;
  brollAvailable: number;
  readyTests: number;
};

/** A recomendação da mentora entra como estratégia, não como culpa. */
export function testLoad(i: LoadInput): { recommended: number; max: number; because: string; basis: 'MENTOR_EXPERIMENT' } {
  const { min, max } = REELS_TEST_POLICY.frequency;
  let recommended = i.intensiveMode ? min : 1;
  const razoes: string[] = [];

  if (i.commercialShootsToday >= 1 || i.minutesCommitted > 90) {
    recommended = Math.min(recommended, 1);
    razoes.push(
      i.commercialShootsToday >= 2
        ? `há ${i.commercialShootsToday} gravações de marca hoje: um teste, e com B-roll que já existe`
        : 'já há gravação de marca hoje: um teste chega, feito com o que já existe',
    );
  }
  if (i.intensiveMode && i.brollAvailable === 0) {
    recommended = Math.min(recommended, 2);
    razoes.push('sem B-roll no banco, cada teste é uma gravação nova');
  }
  if (i.readyTests >= recommended && recommended > 0) {
    razoes.push(`já há ${i.readyTests} ${i.readyTests === 1 ? 'teste preparado' : 'testes preparados'} por publicar`);
    recommended = 0;
  }

  return {
    recommended,
    max: i.intensiveMode ? max : 2,
    basis: 'MENTOR_EXPERIMENT',
    because: razoes.length
      ? razoes.join('; ') + '.'
      : i.intensiveMode
        ? `Modo intensivo: a mentora recomenda ${min} a ${max} por dia, espaçados. Começa por ${min}.`
        : 'Um teste por dia, com o que já existe. O modo intensivo sobe para três.',
  };
}

/* ── B-roll ───────────────────────────────────────────────────────────────── */

export type BrollAsset = { id: string; tags: readonly string[]; title: string; durationSeconds?: number | null };

/** Que take do banco serve esta ideia. Antes de pedir gravação nova. */
export function matchBroll(
  need: { tags: readonly string[]; text?: string },
  bank: readonly BrollAsset[],
): { id: string; score: number; because: string }[] {
  const wanted = new Set(need.tags.map(plain));
  return bank
    .map((a) => {
      const comuns = a.tags.map(plain).filter((t) => wanted.has(t));
      const texto = need.text ? similarity(need.text, `${a.title} ${a.tags.join(' ')}`) : 0;
      const score = Math.round(comuns.length * 30 + texto * 40);
      return { id: a.id, score, because: comuns.length ? `tem ${comuns.join(', ')}` : texto > 0 ? 'parece o que a ideia pede' : '' };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

const TAG_VOCAB: [RegExp, string][] = [
  [/\b(trabalh\w*|working|laptop|notebook|computador|secretaria|escritorio)\b/, 'trabalhando'],
  [/\b(digit\w*|typing|teclado)\b/, 'digitando'],
  [/\b(edit\w*|capcut|timeline)\b/, 'editando'],
  [/\b(maquia\w*|makeup|make|batom)\b/, 'maquiando'],
  [/\b(cafe|coffee|caneca|chavena)\b/, 'café'],
  [/\b(casa|sala|sofa|cozinha|home|apartamento)\b/, 'casa'],
  [/\b(rua|street|cidade|passeio|caminh\w*)\b/, 'rua'],
  [/\b(academia|gym|treino|ginasio)\b/, 'academia'],
  [/\b(telefone|celular|phone|iphone|whatsapp)\b/, 'telefone'],
  [/\b(produto|unboxing|caixa|product)\b/, 'produto'],
  [/\b(setup|tripe|ring ?light|luz|camera)\b/, 'setup'],
  [/\b(namorado|pedro|casal|a dois)\b/, 'namorado'],
  [/\b(braga|bom jesus|se de braga)\b/, 'braga'],
  [/\b(porto|ribeira)\b/, 'porto'],
  [/\b(restaurante|mesa|pedido|pizzaria|cardapio)\b/, 'restaurante'],
  [/\b(pele|rosto|skincare|rosacea)\b/, 'pele'],
  [/\b(cabelo|mascara|secador)\b/, 'cabelo'],
  [/\b(gato|gatos|persa)\b/, 'gatos'],
];

/** Etiquetas sugeridas a partir do nome do arquivo, de uma nota ou do que a
 *  visão devolveu. Ela corrige quando for preciso — nunca cataloga do zero. */
export function suggestBrollTags(input: { fileName?: string | null; note?: string | null; text?: string | null }): string[] {
  const t = plain([input.fileName ?? '', input.note ?? '', input.text ?? ''].join(' ').replace(/[_\-.]+/g, ' '));
  const out: string[] = [];
  for (const [re, tag] of TAG_VOCAB) if (re.test(t) && !out.includes(tag)) out.push(tag);
  return out;
}
