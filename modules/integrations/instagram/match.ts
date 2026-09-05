/** Ligar uma publicação detectada à história que a produziu.
 *
 *  A regra que governa: nunca vincular errado em silêncio. Quando há uma
 *  candidata clara, liga-se e oferece-se desfazer. Quando há duas parecidas,
 *  pergunta-se. Quando não há nada, fica por vincular — e isso é honesto.
 *
 *  Uma peça vinculada à história errada envenena a comparação de desempenho
 *  para sempre, porque o mecanismo registado passa a descrever outra coisa.
 *
 *  Puro. */

export type MatchCandidate = {
  contentId: string;
  storyId: string | null;
  title: string;
  /** Legenda ou texto planeado, para comparação de impressão digital. */
  text: string;
  platform: string;
  status: string;
  /** Quando ficou pronta ou foi gravada. */
  readyAt: string | null;
  externalMediaId?: string | null;
  permalink?: string | null;
};

export type DetectedMedia = {
  externalMediaId: string;
  permalink: string | null;
  caption: string;
  publishedAt: string;
  platform: string;
};

export type MatchScore = {
  candidate: MatchCandidate;
  score: number;
  reasons: string[];
};

export type MatchResult =
  | { kind: 'exact'; candidate: MatchCandidate; because: string }
  | { kind: 'confident'; candidate: MatchCandidate; score: number; because: string }
  | { kind: 'ambiguous'; options: MatchScore[]; because: string }
  | { kind: 'none'; because: string };

/** Acima disto liga-se sozinho, com desfazer. */
export const AUTO_LINK_SCORE = 0.72;
/** Abaixo disto nem se mostra como opção. */
export const MIN_OPTION_SCORE = 0.28;
/** Duas candidatas dentro desta distância são ambíguas por definição. */
export const AMBIGUITY_GAP = 0.12;

const HOURS = 60 * 60 * 1000;
/** Fora desta janela a proximidade temporal deixa de valer. */
export const RECENT_WINDOW_HOURS = 96;

const STOP = new Set([
  'que', 'para', 'com', 'uma', 'dos', 'das', 'por', 'mais', 'como', 'isso', 'esse', 'essa',
  'não', 'nao', 'the', 'and', 'você', 'voce', 'meu', 'minha', 'seu', 'sua', 'foi', 'ter',
  'tem', 'era', 'mas', 'pra', 'pro', 'sem', 'até', 'ate', 'quando', 'porque', 'muito',
]);

const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );

/** Jaccard sobre palavras significativas. Grosseiro de propósito: a legenda
 *  publicada quase nunca é o texto planeado, e um algoritmo fino aqui daria
 *  confiança falsa. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function score(media: DetectedMedia, candidate: MatchCandidate): MatchScore {
  const reasons: string[] = [];
  let s = 0;

  if (candidate.platform === media.platform) {
    s += 0.1;
  } else {
    return { candidate, score: 0, reasons: ['plataforma diferente'] };
  }

  if (candidate.readyAt) {
    const delta = new Date(media.publishedAt).getTime() - new Date(candidate.readyAt).getTime();
    const horas = delta / HOURS;
    // Publicar antes de a peça estar pronta não conta; depois, quanto mais
    // perto melhor, até à janela.
    if (horas >= -2 && horas <= RECENT_WINDOW_HOURS) {
      const proximidade = 1 - Math.max(0, horas) / RECENT_WINDOW_HOURS;
      s += 0.35 * proximidade;
      reasons.push(horas < 24 ? 'publicado no mesmo dia em que ficou pronta' : 'publicado poucos dias depois de ficar pronta');
    }
  }

  if (candidate.status === 'recorded' || candidate.status === 'ready_to_record') {
    s += 0.12;
    reasons.push('estava pronta para gravar');
  }

  const sim = textSimilarity(media.caption, `${candidate.title} ${candidate.text}`);
  if (sim > 0.05) {
    s += 0.45 * Math.min(1, sim * 2.2);
    reasons.push(`a legenda tem ${Math.round(sim * 100)}% de palavras em comum`);
  }

  return { candidate, score: Math.min(1, s), reasons };
}

/** Encontra a peça a que esta mídia corresponde.
 *
 *  A ordem dos portões é a do briefing: id externo já ligado, permalink,
 *  depois a janela + plataforma + impressão digital da legenda. */
export function matchPublication(media: DetectedMedia, candidates: readonly MatchCandidate[]): MatchResult {
  const porId = candidates.find((c) => c.externalMediaId && c.externalMediaId === media.externalMediaId);
  if (porId) return { kind: 'exact', candidate: porId, because: 'Já estava ligado a esta publicação.' };

  if (media.permalink) {
    const porLink = candidates.find((c) => c.permalink && c.permalink === media.permalink);
    if (porLink) return { kind: 'exact', candidate: porLink, because: 'O link é exatamente o mesmo.' };
  }

  const pontuadas = candidates
    .filter((c) => !c.externalMediaId)
    .map((c) => score(media, c))
    .filter((m) => m.score >= MIN_OPTION_SCORE)
    .sort((a, b) => b.score - a.score);

  if (pontuadas.length === 0) {
    return { kind: 'none', because: 'Não encontrei nenhuma história que combine com esta publicação.' };
  }

  const [primeira, segunda] = pontuadas;

  if (segunda && primeira.score - segunda.score < AMBIGUITY_GAP) {
    return {
      kind: 'ambiguous',
      options: pontuadas.slice(0, 3),
      because: 'Tenho mais de uma história parecida. Prefiro perguntar a errar.',
    };
  }

  if (primeira.score >= AUTO_LINK_SCORE) {
    return { kind: 'confident', candidate: primeira.candidate, score: primeira.score, because: primeira.reasons.join('; ') };
  }

  return {
    kind: 'ambiguous',
    options: pontuadas.slice(0, 3),
    because: 'Tenho um palpite, mas não o suficiente para ligar sozinho.',
  };
}

/** A frase que o cartão mostra. Sempre a nomear a história, nunca um id. */
export function matchQuestion(result: MatchResult): string {
  if (result.kind === 'confident') return `Parece corresponder a: ${result.candidate.title}.`;
  if (result.kind === 'ambiguous') return 'Esse conteúdo corresponde a qual história?';
  if (result.kind === 'exact') return `Ligado a: ${result.candidate.title}.`;
  return 'Ainda não sei a que história isso corresponde.';
}
