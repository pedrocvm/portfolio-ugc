import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { checkEmail } from './mailcheck-dns';
import { chooseFromResearch, mailboxFit, pickOutreachEmail, type EmailCandidate } from './mailcheck';
import { researchCandidate } from './research';

/** Ir buscar a caixa de marketing das marcas que já estão na base.
 *
 *  A escolha da caixa passou a ser código, mas isso só vale para as marcas
 *  pesquisadas depois disso. As que já cá estavam ficaram com o que o modelo
 *  tinha escolhido — `suporte@`, `reservas@`, `meajuda@` — e uma proposta de
 *  parceria nessas caixas é um ticket, não uma conversa.
 *
 *  Corre outra vez a pesquisa dessas, e só dessas: quem já está numa caixa de
 *  quem decide não se toca, e quem ela corrigiu à mão muito menos — a palavra
 *  dela ganha sempre à pesquisa. */

export type RecheckReport = {
  looked: number;
  changed: { name: string; from: string; to: string }[];
  kept: number;
  failed: string[];
  /** Quantas ficaram por rever quando o tempo acabou. */
  remaining: number;
};

/** Um pedido a esta ação faz duas chamadas ao modelo por marca. Vinte marcas
 *  já passam do tecto de uma função na Vercel, e uma revisão que rebenta a
 *  meio não diz o que reviu. Faz-se por lotes, e diz-se quantas faltam. */
const LOTE = 8;
const TECTO_MS = 200_000;

export async function recheckOutreachEmails(): Promise<RecheckReport> {
  const db = supabaseService();

  const { data } = await db
    .from('outreach_candidate')
    .select(
      'id, name, normalized_name, website, domain, country, niche_id, why_fit, contact_email, contact_email_set_by_carol, status',
    )
    .neq('status', 'sent')
    .not('contact_email', 'is', null)
    .order('rank');

  // Quem já está na caixa certa não custa uma chamada ao modelo; quem ela
  // corrigiu à mão está fechado — foi ela que o escreveu.
  const alvos = (data ?? []).filter(
    (r) => !r.contact_email_set_by_carol && mailboxFit(r.contact_email as string) !== 'target',
  );

  const report: RecheckReport = {
    looked: 0,
    changed: [],
    kept: 0,
    failed: [],
    remaining: Math.max(0, alvos.length - LOTE),
  };

  const comecou = Date.now();

  for (const row of alvos.slice(0, LOTE)) {
    if (Date.now() - comecou > TECTO_MS) {
      report.remaining = alvos.length - report.looked;
      break;
    }
    report.looked++;

    const found = await researchCandidate({
      name: row.name,
      normalizedName: row.normalized_name,
      website: row.website,
      domain: row.domain,
      country: row.country,
      description: '',
      why: row.why_fit ?? '',
      source: row.website,
      nicheId: row.niche_id,
    }).catch(() => null);

    if (!found) {
      report.failed.push(`${row.name}: a pesquisa não devolveu nada.`);
      continue;
    }

    // O endereço atual entra na disputa como mais um: assim é a mesma regra a
    // decidir, e uma pesquisa pior nunca substitui uma caixa melhor.
    const atual = row.contact_email as string;
    const encontrados = chooseFromResearch(found.research.contact);
    const todos: EmailCandidate[] = [
      { address: atual, team: null, source: 'research' },
      ...(encontrados.chosen ? [encontrados.chosen] : []),
      ...encontrados.alternatives,
    ];
    const escolha = pickOutreachEmail(todos);
    const novo = escolha.chosen?.address;

    if (!novo || novo.toLowerCase() === atual.toLowerCase()) {
      report.kept++;
      continue;
    }

    const check = await checkEmail(novo, escolha.chosen?.source ?? 'research');
    if (!check.valid) {
      report.failed.push(`${row.name}: ${novo} — ${check.reason}`);
      continue;
    }

    const { error } = await db
      .from('outreach_candidate')
      .update({
        contact_email: novo,
        contact_email_options: asJson(escolha.alternatives),
        email_confidence: check.confidence,
        contact_source: `${found.research.contact?.source ?? 'pesquisa'} · ${check.reason}`,
        contact_name: found.research.contact?.name ?? null,
        contact_role: found.research.contact?.role ?? null,
      })
      .eq('id', row.id);

    if (error) {
      report.failed.push(`${row.name}: não consegui salvar — ${error.message}`);
      continue;
    }
    report.changed.push({ name: row.name, from: atual, to: novo });
  }

  return report;
}
