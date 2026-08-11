/** A conta dos acessos à página de ligações, a partir dos eventos crus. São os
 *  acessos de uma pessoa, não de um portal: uma vista em SQL por cada corte
 *  era mais peça para manter do que trabalho poupado.
 *  ponytail: se um dia passar das dezenas de milhar de linhas, isto vira
 *  vista materializada na base. */

export type LinkEventRow = {
  type: 'view' | 'click' | 'contact' | 'share';
  target: string;
  referrer: string;
  utm_source: string;
  device: string;
  country: string;
  session: string;
  created_at: string;
};

export type Contagem = { nome: string; total: number };

export type Resumo = {
  dias: number;
  visitas: number;
  cliques: number;
  contactos: number;
  partilhas: number;
  /** Por cada cem visitas, quantas tocaram nalguma coisa. */
  taxa: number;
  porDia: { dia: string; visitas: number; cliques: number }[];
  ligacoes: Contagem[];
  origens: Contagem[];
  aparelhos: Contagem[];
  paises: Contagem[];
};

export const PERIODOS = [7, 30, 90] as const;

/** O dia a que o evento pertence é o dia dela, não o do servidor. */
const LISBOA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const diaEm = (iso: string) => LISBOA.format(new Date(iso));

function contar(pares: string[]): Contagem[] {
  const mapa = new Map<string, number>();
  for (const p of pares) mapa.set(p, (mapa.get(p) ?? 0) + 1);
  return [...mapa]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export function resumir(rows: LinkEventRow[], dias: number, agora = new Date()): Resumo {
  const limite = agora.getTime() - dias * 86400000;
  const dentro = rows.filter((r) => new Date(r.created_at).getTime() >= limite);

  const doTipo = (t: LinkEventRow['type']) => dentro.filter((r) => r.type === t);
  const vistas = doTipo('view');
  const cliques = doTipo('click');
  const contactos = doTipo('contact');

  /* a grelha tem de ter todos os dias, mesmo os que ninguém abriu: um gráfico
     que salta os dias vazios mente sobre o ritmo */
  const grelha = new Map<string, { visitas: number; cliques: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    grelha.set(diaEm(new Date(agora.getTime() - i * 86400000).toISOString()), {
      visitas: 0,
      cliques: 0,
    });
  }
  for (const r of dentro) {
    const casa = grelha.get(diaEm(r.created_at));
    if (!casa) continue;
    if (r.type === 'view') casa.visitas++;
    if (r.type === 'click' || r.type === 'contact') casa.cliques++;
  }

  const tocaram = cliques.length + contactos.length;

  return {
    dias,
    visitas: vistas.length,
    cliques: cliques.length,
    contactos: contactos.length,
    partilhas: doTipo('share').length,
    taxa: vistas.length ? Math.round((tocaram / vistas.length) * 100) : 0,
    porDia: [...grelha].map(([dia, v]) => ({ dia, ...v })),
    ligacoes: contar([...cliques, ...contactos].map((r) => r.target || '—')),
    origens: contar(
      vistas.map((r) => r.utm_source || r.referrer || 'Direto'),
    ),
    aparelhos: contar(vistas.map((r) => r.device || 'desconhecido')),
    paises: contar(vistas.map((r) => r.country || '—')),
  };
}
