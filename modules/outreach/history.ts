/** O histórico de prospeção, resumido.
 *
 *  Duas perguntas: quem é que já vimos — para não pesquisar de novo a mesma
 *  marca — e a prospeção está prestando. A segunda não se responde com um
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
  edited: 'editada à mão',
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
  if (s.total === 0) return 'Ainda não há prospeções no histórico.';

  const marcas = `${s.total} ${s.total === 1 ? 'marca' : 'marcas'}`;
  const partes: string[] = [];
  if (s.sent) partes.push(`${s.sent} ${s.sent === 1 ? 'enviada' : 'enviadas'}`);
  if (s.waiting) partes.push(`${s.waiting} à espera`);
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

/** «Hoje» e «Ontem» leem-se sem contar nos dedos; o resto leva a data por
 *  extenso. Um cabeçalho de dia que diga «2026-08-31» faz a pessoa converter. */
export function dayLabel(day: string, now = new Date()): string {
  const hoje = now.toISOString().slice(0, 10);
  const ontem = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  if (day === hoje) return 'Hoje';
  if (day === ontem) return 'Ontem';

  const [y, m, d] = day.split('-').map(Number);
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesmoAno = y === now.getFullYear();
  return `${d} de ${meses[m - 1]}${mesmoAno ? '' : ` de ${y}`}`;
}

/** O modelo devolve o país como lhe apetece: «Germany», «Alemanha»,
 *  «Alemanha / Brasil». Três grafias da mesma coisa numa lista fazem-na parecer
 *  desarrumada e escondem que são o mesmo lugar. */
const PAISES: Record<string, string> = {
  germany: 'Alemanha', deutschland: 'Alemanha', de: 'Alemanha',
  brazil: 'Brasil', br: 'Brasil',
  portugal: 'Portugal', pt: 'Portugal',
  spain: 'Espanha', españa: 'Espanha', es: 'Espanha',
  'united states': 'EUA', usa: 'EUA', us: 'EUA',
  'united kingdom': 'Reino Unido', uk: 'Reino Unido', gb: 'Reino Unido',
  france: 'França', fr: 'França',
  italy: 'Itália', it: 'Itália',
  netherlands: 'Países Baixos', nl: 'Países Baixos',
  austria: 'Áustria', at: 'Áustria',
};

export function countryLabel(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  // Vários países numa string acontecem: normalizam-se um a um.
  const partes = raw.split(/\s*[/,;]\s*|\s+e\s+/).filter(Boolean);
  const limpos = partes.map((p) => PAISES[p.trim().toLowerCase()] ?? p.trim());
  return [...new Set(limpos)].join(' · ');
}

/** O dia somado, não uma corrida qualquer dele.
 *
 *  Um dia pode ter várias corridas — o cron de manhã e cada vez que ela carrega
 *  em «procurar agora». Mostrar uma delas dava um número que não explicava as
 *  marcas na lista; mostrar a mais antiga, que era o que acontecia, dava um
 *  número errado. */
export type RunLike = {
  run_date: string;
  discovered: number;
  researched: number;
  selected: number;
  status: string;
};

export function dayTotals(runs: readonly RunLike[]): Map<string, {
  runs: number;
  discovered: number;
  researched: number;
  selected: number;
}> {
  const out = new Map<string, { runs: number; discovered: number; researched: number; selected: number }>();
  for (const r of runs) {
    const t = out.get(r.run_date) ?? { runs: 0, discovered: 0, researched: 0, selected: 0 };
    t.runs += 1;
    t.discovered += r.discovered;
    t.researched += r.researched;
    t.selected += r.selected;
    out.set(r.run_date, t);
  }
  return out;
}

/* ── Sinais que se explicam sozinhos ─────────────────────────────────────── */

/** O que a linha diz sobre uma marca.
 *
 *  Isto mostrava «2 bandeiras», que obriga a perguntar o que é uma bandeira.
 *  Um indicador que precisa ser explicado não é um indicador — é um enigma
 *  com número. Cada sinal aqui é uma frase curta que se entende à primeira, e
 *  o que não couber vive na análise. */
export type Signal = { text: string; tone: 'good' | 'watch' | 'plain' };

export type SignalInput = {
  city?: string | null;
  country: string | null;
  paid_media_signal: string | null;
  ugc_signal: string | null;
  contact_email: string | null;
  email_confidence?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  socials?: Record<string, string | null> | null;
  red_flags?: string[] | null;
};

/** Onde está, dito como se diz. */
export function placeLabel(c: Pick<SignalInput, 'city' | 'country'>): string | null {
  const pais = countryLabel(c.country);
  const cidade = c.city?.trim();
  if (cidade && pais) return `${cidade}, ${pais}`;
  return cidade || pais || null;
}

/** O canal por onde ela consegue falar com eles, e só o melhor. */
export function channelSignal(c: SignalInput): Signal {
  const whatsapp = c.whatsapp?.trim();
  const instagram = c.instagram?.trim() || c.socials?.instagram?.trim();
  const emailFraco = c.email_confidence === 'low' || c.email_confidence === 'unknown';

  if (whatsapp) return { text: 'WhatsApp encontrado', tone: 'good' };
  if (c.contact_email && !emailFraco) return { text: 'Email verificado', tone: 'good' };
  if (c.contact_email) return { text: 'Email por confirmar', tone: 'watch' };
  if (instagram) return { text: 'Só por Instagram', tone: 'plain' };
  return { text: 'Sem contato direto', tone: 'watch' };
}

/** Dois ou três sinais na linha; o resto fica na análise.
 *
 *  Mostrar tudo era a razão por que não se lia nada: cinco etiquetas iguais
 *  competem entre si e nenhuma ganha.
 *
 *  O canal vem primeiro e nunca cai — é o que decide se ela consegue falar com
 *  a marca, e sem isso o resto não interessa. */
export function signalsFor(c: SignalInput, limit = 3): Signal[] {
  const resto: Signal[] = [];

  if (c.paid_media_signal === 'strong') resto.push({ text: 'Anúncios ativos', tone: 'good' });
  else if (c.paid_media_signal === 'none') resto.push({ text: 'Sem anúncios detectados', tone: 'watch' });

  if (c.ugc_signal === 'creator_program' || c.ugc_signal === 'ugc') {
    resto.push({ text: 'Trabalha com creators', tone: 'good' });
  } else if (c.ugc_signal === 'product_only') {
    resto.push({ text: 'Pouco conteúdo humano', tone: 'watch' });
  }

  // As bandeiras contavam-se; agora dizem-se. Uma cabe na linha; as outras
  // estão na análise, onde há espaço para as ler inteiras.
  const flag = c.red_flags?.[0]?.trim();
  if (flag) resto.push({ text: shorten(flag), tone: 'watch' });

  return [channelSignal(c), ...resto].slice(0, limit);
}

/** Uma bandeira inteira não cabe numa etiqueta; o princípio dela cabe. */
function shorten(text: string, max = 34): string {
  const limpo = text.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  return `${corte.slice(0, corte.lastIndexOf(' ') > 12 ? corte.lastIndexOf(' ') : max)}…`;
}
