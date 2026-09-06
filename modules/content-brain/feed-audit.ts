/** A auditoria do Feed: por peça, e o resumo do que se está a aprender.
 *
 *  Não é um painel de vaidade. Cada peça responde a «como correu, relativo a
 *  mim, e o que isso muda no que faço» — e o resumo do topo tem no máximo
 *  cinco frases, cada uma com amostra, confiança e prova.
 *
 *  Regras que este módulo não deixa quebrar:
 *
 *  - «bom» e «ruim» não existem. Existe «1,8× a mediana de comentários» e
 *    «amostra insuficiente».
 *  - uma peça sem mecanismo registado não recebe hipótese de causa. Recebe
 *    «não sei porquê», que é verdade.
 *  - um grupo com menos de três peças não conclui nada; diz que não conclui.
 *
 *  Puro. */

import type { RelativeReading, SnapshotKind } from './metrics';

export const FEED_AUDIT_POLICY_V1 = {
  version: 'CAROL_FEED_AUDIT_V1',
  /** Acima disto uma métrica conta como «acima»; abaixo do inverso, «abaixo». */
  materialRatio: 1.3,
  /** Peças por grupo para uma frase de resumo. */
  minGroup: 3,
  /** Uma mediana abaixo disto não sustenta um sinal: «53× a mediana» de
   *  compartilhamentos, quando a mediana é 1, é um número a fingir de padrão. */
  minMedianForSignal: 5,
} as const;

/** Etiquetas que dizem «não sei», não «este formato». Nunca viram grupo. */
const UNCLASSIFIED = new Set(['outro', 'other', 'tema não classificado', 'gancho não classificado', 'não dá para ver', 'unknown']);

export type AuditTags = {
  format: string | null;
  theme: string | null;
  hook: string | null;
  /** De onde vieram as etiquetas: leitura de legenda pelo modelo, ela, ou a
   *  história ligada. Nunca sem origem. */
  source: 'ai_caption' | 'carol' | 'story_link' | null;
  confidence: number | null;
};

export type FeedPieceInput = {
  mediaId: string;
  title: string;
  publishedAt: string;
  mediaProductType: string;
  pillarLabel: string | null;
  mechanism: string | null;
  tags: AuditTags;
  readings: RelativeReading[];
  latestKind: SnapshotKind | null;
  /** Idade da leitura usada, em dias. Diz-se na tela: «leitura aos 412 dias». */
  readingAgeDays: number | null;
};

export type PieceAudit = {
  mediaId: string;
  function: string;
  format: string;
  theme: string;
  hook: string;
  /** «Comentários: 1,8× a sua mediana · Alcance: 0,7×». */
  relativeLine: string;
  engagementQuality: string;
  signals: string[];
  hypothesis: string;
  nextTest: string;
  sample: string;
  strongest: RelativeReading | null;
  weakest: RelativeReading | null;
};

const fmtRatio = (r: number) => `${r.toFixed(1).replace('.', ',')}×`;

const READ_LABEL: Record<string, string> = {
  views: 'Views',
  reach: 'Alcance',
  likes: 'Curtidas',
  comments: 'Comentários',
  saves: 'Salvamentos',
  shares: 'Compartilhamentos',
  follows: 'Seguidores',
  avg_watch_time_seconds: 'Retenção média',
};

const label = (metric: string) => READ_LABEL[metric] ?? metric;

/** A leitura de uma peça. Só diz o que os números dela permitem. */
export function auditPiece(p: FeedPieceInput, policy = FEED_AUDIT_POLICY_V1): PieceAudit {
  const comparaveis = p.readings.filter((r) => r.comparable && r.ratio !== null);
  // Sinais só onde a mediana aguenta o peso do «×».
  const solidas = comparaveis.filter((r) => (r.median ?? 0) >= policy.minMedianForSignal);
  const acima = solidas.filter((r) => (r.ratio as number) >= policy.materialRatio);
  const abaixo = solidas.filter((r) => (r.ratio as number) <= 1 / policy.materialRatio);
  const ordenadas = [...solidas].sort((a, b) => (b.ratio as number) - (a.ratio as number));
  const strongest = ordenadas[0] ?? null;
  const weakest = ordenadas.length > 1 ? ordenadas[ordenadas.length - 1] : null;

  const relativeLine = comparaveis.length
    ? comparaveis.map((r) => `${label(r.metric)}: ${fmtRatio(r.ratio as number)}`).join(' · ')
    : p.readings.length
      ? p.readings[0].reading
      : 'Sem métricas da API para esta peça.';

  // Qualidade de engajamento: comentários e salvamentos relativos ao alcance,
  // lidos pela posição relativa — não por um limiar de fora.
  const c = comparaveis.find((r) => r.metric === 'comments');
  const s = comparaveis.find((r) => r.metric === 'saves');
  const reach = comparaveis.find((r) => r.metric === 'reach' || r.metric === 'views');
  let engagementQuality = 'Sem amostra comparável para ler o engajamento.';
  if (c || s) {
    const partes: string[] = [];
    if (c) partes.push(`comentários ${(c.ratio as number) >= policy.materialRatio ? 'acima' : (c.ratio as number) <= 1 / policy.materialRatio ? 'abaixo' : 'na linha'} da mediana`);
    if (s) partes.push(`salvamentos ${(s.ratio as number) >= policy.materialRatio ? 'acima' : (s.ratio as number) <= 1 / policy.materialRatio ? 'abaixo' : 'na linha'}`);
    if (reach && (reach.ratio as number) >= policy.materialRatio && c && (c.ratio as number) < 1) {
      partes.push('alcance alto sem conversa: chegou longe, não prendeu');
    }
    engagementQuality = `${partes.join(', ')}.`;
  }

  const signals: string[] = [];
  for (const r of acima) signals.push(`${label(r.metric)} ${fmtRatio(r.ratio as number)} a sua mediana`);
  for (const r of abaixo) signals.push(`${label(r.metric)} ${fmtRatio(r.ratio as number)} — abaixo do seu normal`);

  const hypothesis = !comparaveis.length
    ? 'Amostra insuficiente: ainda não dá para dizer o que esta peça ensina.'
    : p.mechanism
      ? acima.length
        ? `Vale repetir o mecanismo (${p.mechanism}) em outra história real — não copiar o vídeo.`
        : abaixo.length
          ? `O mecanismo (${p.mechanism}) não rendeu aqui. Uma peça não derruba; duas começam a contar.`
          : `Dentro do normal. O mecanismo (${p.mechanism}) não se destacou nem caiu.`
      : acima.length
        ? 'Rendeu acima do normal, mas sem mecanismo registado não dá para saber porquê. Se voltar a acontecer, vale ligar a uma história.'
        : abaixo.length
          ? 'Rendeu abaixo do normal. Sem mecanismo registado, a causa fica em aberto.'
          : 'Dentro do normal. Nada a concluir.';

  const nextTest = !comparaveis.length
    ? 'Esperar a leitura. Sem número não há teste.'
    : acima.length && p.mechanism
      ? `Repetir «${p.mechanism}» numa situação diferente e ver se ${label(acima[0].metric).toLowerCase()} volta a subir.`
      : acima.length
        ? 'Gravar outra peça com a mesma forma e um assunto diferente, desta vez ligada a uma história para o mecanismo ficar registado.'
        : abaixo.length
          ? 'Não repetir já. Se a forma voltar a cair noutra peça, deixa de ser acaso.'
          : 'Nenhum teste puxado por esta peça.';

  const sample = comparaveis.length
    ? `${comparaveis.length} ${comparaveis.length === 1 ? 'métrica comparável' : 'métricas comparáveis'}${p.readingAgeDays !== null ? ` · leitura aos ${p.readingAgeDays} dias` : ''}`
    : p.readings.length
      ? p.readings.find((r) => !r.comparable)?.reading.split(' — ')[1] ?? 'sem amostra comparável'
      : 'sem métricas';

  return {
    mediaId: p.mediaId,
    function: p.pillarLabel ?? 'sem função registada',
    format: p.tags.format ?? (p.mediaProductType === 'REELS' ? 'Reel' : p.mediaProductType === 'FEED' ? 'Feed' : p.mediaProductType.toLowerCase()),
    theme: p.tags.theme ?? 'tema não classificado',
    hook: p.tags.hook ?? 'gancho não classificado',
    relativeLine,
    engagementQuality,
    signals,
    hypothesis,
    nextTest,
    sample,
    strongest,
    weakest,
  };
}

/* ── O resumo do topo ─────────────────────────────────────────────────────── */

export type SummaryPoint = {
  text: string;
  sample: string;
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
};

const mediana = (xs: number[]): number | null => {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** «O que estamos aprendendo até agora», em três a cinco pontos.
 *
 *  Cada ponto nasce de um grupo — formato, tema, função — com pelo menos três
 *  peças comparáveis. Grupos menores viram, no máximo, «amostra pequena demais
 *  para concluir sobre X». Sem nada comparável, uma frase a dizer isso. */
export function feedSummary(
  pieces: readonly { input: FeedPieceInput; audit: PieceAudit }[],
  opts: { max?: number; minGroup?: number } = {},
): SummaryPoint[] {
  const max = opts.max ?? 5;
  const min = opts.minGroup ?? FEED_AUDIT_POLICY_V1.minGroup;
  const comparaveis = pieces.filter((p) => p.input.readings.some((r) => r.comparable));
  const out: SummaryPoint[] = [];

  if (comparaveis.length < min) {
    return [
      {
        text:
          comparaveis.length === 0
            ? 'Ainda não sei: nenhuma peça tem métricas comparáveis com a sua mediana.'
            : `Ainda não sei: só ${comparaveis.length} ${comparaveis.length === 1 ? 'peça tem' : 'peças têm'} métricas comparáveis. Preciso de pelo menos ${min}.`,
        sample: `${pieces.length} peças importadas, ${comparaveis.length} comparáveis`,
        confidence: 'low',
        evidence: [],
      },
    ];
  }

  const grupos: { chave: string; label: string; pecas: typeof comparaveis }[] = [];
  const porChave = (k: 'format' | 'theme' | 'function', prefixo: string) => {
    const mapa = new Map<string, typeof comparaveis>();
    for (const p of comparaveis) {
      const v = k === 'function' ? p.input.pillarLabel : p.input.tags[k];
      if (!v || UNCLASSIFIED.has(v.toLowerCase())) continue;
      mapa.set(v, [...(mapa.get(v) ?? []), p]);
    }
    for (const [v, lista] of mapa) grupos.push({ chave: `${k}:${v}`, label: `${prefixo} «${v}»`, pecas: lista });
  };
  porChave('format', 'Peças');
  porChave('theme', 'Peças sobre');
  porChave('function', 'Peças de');

  const metricas = ['comments', 'saves', 'reach', 'views', 'follows', 'shares'];
  const pequenos: string[] = [];

  for (const g of grupos) {
    if (g.pecas.length < min) {
      pequenos.push(`${g.label.toLowerCase()} (${g.pecas.length})`);
      continue;
    }
    for (const m of metricas) {
      const ratios = g.pecas
        .map((p) => p.input.readings.find((r) => r.metric === m && r.comparable && (r.median ?? 0) >= FEED_AUDIT_POLICY_V1.minMedianForSignal)?.ratio ?? null)
        .filter((r): r is number => r !== null);
      if (ratios.length < min) continue;
      const med = mediana(ratios)!;
      if (med >= FEED_AUDIT_POLICY_V1.materialRatio) {
        out.push({
          text: `${g.label} estão gerando ${label(m).toLowerCase()} acima da sua mediana (${fmtRatio(med)} no meio do grupo).`,
          sample: `${ratios.length} peças`,
          confidence: ratios.length >= min * 2 ? 'medium' : 'low',
          evidence: g.pecas.map((p) => p.input.mediaId),
        });
        break;
      }
      if (med <= 1 / FEED_AUDIT_POLICY_V1.materialRatio) {
        out.push({
          text: `${g.label} ficam abaixo da sua mediana em ${label(m).toLowerCase()} (${fmtRatio(med)} no meio do grupo). Não é veredito; é o que os números dizem por agora.`,
          sample: `${ratios.length} peças`,
          confidence: ratios.length >= min * 2 ? 'medium' : 'low',
          evidence: g.pecas.map((p) => p.input.mediaId),
        });
        break;
      }
    }
  }

  // A mais forte e a mais fraca, sempre relativas.
  const comForca = comparaveis
    .map((p) => ({ p, r: p.audit.strongest }))
    .filter((x): x is { p: (typeof comparaveis)[number]; r: RelativeReading } => x.r !== null && x.r.ratio !== null);
  if (comForca.length >= min) {
    const top = [...comForca].sort((a, b) => (b.r.ratio as number) - (a.r.ratio as number))[0];
    out.push({
      text: `A peça mais forte, relativa a você, é «${top.p.input.title}»: ${label(top.r.metric).toLowerCase()} ${fmtRatio(top.r.ratio as number)} a sua mediana. Vale repetir o mecanismo, não o vídeo.`,
      sample: `entre ${comForca.length} peças comparáveis`,
      confidence: 'low',
      evidence: [top.p.input.mediaId],
    });
  }

  if (pequenos.length) {
    out.push({
      text: `Amostra pequena demais para concluir sobre ${pequenos.slice(0, 3).join(', ')}.`,
      sample: 'menos de três peças por grupo',
      confidence: 'low',
      evidence: [],
    });
  }

  if (out.length === 0) {
    out.push({
      text: `${comparaveis.length} peças comparáveis e nenhum grupo se destaca. Ainda não sei o que funciona melhor — e prefiro dizer isso a inventar.`,
      sample: `${comparaveis.length} peças`,
      confidence: 'low',
      evidence: [],
    });
  }

  return out.slice(0, max);
}
