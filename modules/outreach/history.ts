/** O histórico de prospecção, resumido.
 *
 *  Duas perguntas: quem é que já vimos — para não voltar a pesquisar a mesma
 *  marca — e a prospecção está a prestar. A segunda não se responde com um
 *  total: responde-se com quantas passaram o corte de qualidade e em que é que
 *  as outras falharam. */

export type HistoryRow = {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  niche_id: string | null;
  fit_score: number | null;
  fit_band: string | null;
  status: string;
  reject_reason: string | null;
  sent_at: string | null;
  created_at: string;
  red_flags: string[] | null;
  quality: { pass: boolean; score: number; failures: string[] } | null;
  contact_email: string | null;
  email_confidence: string | null;
};

export const PAID_LABEL: Record<string, string> = {
  strong: 'compra criativos', medium: 'anuncia', weak: 'anuncia pouco', none: 'sem anúncios',
};
export const UGC_LABEL: Record<string, string> = {
  creator_program: 'tem programa de creators', ugc: 'já usa UGC',
  influencers: 'só influencers', product_only: 'só produto', none: 'sem creators',
};
export const CONF_LABEL: Record<string, string> = {
  verified: 'verificado', high: 'confiança alta', medium: 'confiança média',
  low: 'confiança baixa', unknown: 'por confirmar',
};

export const STATUS_LABEL: Record<string, string> = {
  discovered: 'encontrada',
  screened: 'triada',
  researched: 'pesquisada',
  ready: 'pronta para enviar',
  needs_review: 'a precisar de olhos',
  approved: 'aprovada',
  edited: 'editada por você',
  sent: 'enviada',
  skipped: 'posta de lado',
  rejected: 'recusada',
  failed: 'falhou',
};

/** Estados em que a marca chegou ao fim do funil. O resto ficou pelo caminho. */
const CLOSED = new Set(['sent', 'approved', 'edited']);

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

export type Summary = {
  total: number;
  sent: number;
  waiting: number;
  discarded: number;
  /** Média só das que chegaram a ser pesquisadas: incluir as que morreram antes
   *  puxava a média para baixo por uma razão que não é de qualidade. */
  avgFit: number | null;
  qualityChecked: number;
  qualityPassed: number;
  /** Em que é que os emails falharam, do mais comum para o menos. É isto que
   *  diz o que corrigir no prompt. */
  topFailures: { reason: string; count: number }[];
  topNiches: { niche: string; count: number }[];
};

export function summarize(rows: HistoryRow[]): Summary {
  const scored = rows.map((r) => r.fit_score).filter((n): n is number => typeof n === 'number');
  const checked = rows.filter((r) => r.quality);

  const failures = new Map<string, number>();
  for (const r of checked) {
    for (const f of r.quality?.failures ?? []) failures.set(f, (failures.get(f) ?? 0) + 1);
  }
  const niches = new Map<string, number>();
  for (const r of rows) {
    if (r.niche_id) niches.set(r.niche_id, (niches.get(r.niche_id) ?? 0) + 1);
  }

  const top = (m: Map<string, number>, key: 'reason' | 'niche') =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([k, count]) => ({ [key]: k, count })) as never;

  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === 'sent').length,
    waiting: rows.filter((r) => !CLOSED.has(r.status) && r.status !== 'rejected' && r.status !== 'skipped' && r.status !== 'failed').length,
    discarded: rows.filter((r) => r.status === 'rejected' || r.status === 'skipped').length,
    avgFit: scored.length ? Math.round(scored.reduce((t, n) => t + n, 0) / scored.length) : null,
    qualityChecked: checked.length,
    qualityPassed: checked.filter((r) => r.quality?.pass).length,
    topFailures: top(failures, 'reason'),
    topNiches: top(niches, 'niche'),
  };
}

/** Agrupa por dia, do mais recente para o mais antigo. Uma corrida é um dia de
 *  trabalho, e é assim que ela se lembra dele. */
export function groupByDay<T extends { created_at: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const days = new Map<string, T[]>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    (days.get(day) ?? days.set(day, []).get(day)!).push(r);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, rows]) => ({ day, rows }));
}

/** Uma frase sobre o lote, para quem não quer ler a tabela. */
export function summarySentence(s: Summary): string {
  if (s.total === 0) return 'Ainda não há prospecções no histórico.';

  const marcas = `${s.total} ${s.total === 1 ? 'marca' : 'marcas'}`;
  const partes: string[] = [];
  if (s.sent) partes.push(`${s.sent} ${s.sent === 1 ? 'enviada' : 'enviadas'}`);
  if (s.waiting) partes.push(`${s.waiting} à espera de você`);
  if (s.discarded) partes.push(`${s.discarded} de lado`);

  const fim = partes.length
    ? `${partes.slice(0, -1).join(', ')}${partes.length > 1 ? ' e ' : ''}${partes[partes.length - 1]}`
    : 'nenhuma decidida ainda';

  const qualidade =
    s.qualityChecked > 0 && s.qualityPassed < s.qualityChecked
      ? ` ${s.qualityChecked - s.qualityPassed} ${s.qualityChecked - s.qualityPassed === 1 ? 'email não passou' : 'emails não passaram'} no corte de qualidade.`
      : '';

  return `${marcas}: ${fim}.${qualidade}`;
}
