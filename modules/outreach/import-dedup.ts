import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { normalizeDomain, normalizeName } from '@/modules/brands/identity';
import { classifyResolution, type Classified, type DedupEvidence } from './import';
import { gmailHasHistory, type GmailHistory } from './suppression';

/** «A Carol já falou com esta gente?» — perguntado antes de se gastar uma
 *  pesquisa de cold lead.
 *
 *  O CRM só sabe o que nasceu dentro dele, e a Carol trabalha há mais tempo do
 *  que o CarolOS existe. Por isso a pergunta vai a cinco sítios, e o Gmail é um
 *  deles: uma marca pode ter sido abordada ANTES de existir no CarolOS, e
 *  mandar-lhe um primeiro contato é a forma mais rápida de parecer que não se
 *  sabe o que se anda fazendo.
 *
 *  Quando o Gmail não responde, isso NÃO vira «é nova». Vira
 *  `dedupComplete: false`, e a abordagem sai com aviso. */

export type DedupResult = Classified & {
  evidence: DedupEvidence;
  /** Falso quando não foi possível perguntar ao Gmail. */
  dedupComplete: boolean;
  /** O que se encontrou, em linhas para ela ler. */
  lines: string[];
  brandId: string | null;
  opportunityId: string | null;
  gmail: GmailHistory;
};

/** As etapas por ordem de avanço. Uma marca pode ter várias oportunidades; a
 *  que manda na decisão é a mais avançada, porque é a que mais se estraga com
 *  uma abordagem por fora. */
const AVANCO: Record<string, number> = {
  discovered: 1, qualified: 2, nurture: 3, lost: 4, outreach: 5, replied: 6,
  commercial_qualification: 7, proposal: 8, negotiation: 9, won: 10,
};

const SEM_GMAIL: GmailHistory = {
  found: false, checked: false, subjects: [], lastAt: null, lastSubject: null,
  theyReplied: false, waitingReply: false, messages: 0,
};

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

export async function dedupFor(input: {
  name: string;
  domain: string | null;
  website: string | null;
  instagram: string | null;
  identityCertain: boolean;
}): Promise<DedupResult> {
  const db = supabaseService();
  const normalized = normalizeName(input.name);
  const domain = normalizeDomain(input.domain ?? input.website);
  const lines: string[] = [];

  // ── O CRM ───────────────────────────────────────────────────────────────
  //    A marca procura-se por prova primeiro (domínio) e por nome normalizado
  //    depois. Nome parecido nunca: `resolveBrand` já diz porquê.
  let brand: { id: string; name: string; last_activity_at: string | null } | null = null;
  if (domain) {
    // Duas consultas simples e não um `or` interpolado: o domínio vai para
    // dentro da sintaxe de filtro do PostgREST, e uma vírgula lá dentro é um
    // operador. Um valor de utilizador nunca se cola a um filtro.
    const { data: porDominio } = await db
      .from('brand')
      .select('id, name, last_activity_at')
      .eq('domain', domain)
      .limit(1)
      .maybeSingle();
    brand = porDominio ?? null;

    if (!brand) {
      // As marcas antigas nem sempre têm `domain` preenchido — só o site.
      const { data: porSite } = await db
        .from('brand')
        .select('id, name, last_activity_at, website_url')
        .not('website_url', 'is', null)
        .limit(400);
      brand = (porSite ?? []).find((b) => normalizeDomain(b.website_url) === domain) ?? null;
    }
  }
  if (!brand && normalized) {
    const { data } = await db
      .from('brand')
      .select('id, name, last_activity_at')
      .eq('normalized_name', normalized)
      .limit(1)
      .maybeSingle();
    brand = data ?? null;
  }

  let opportunityStage: string | null = null;
  let opportunityId: string | null = null;
  if (brand) {
    lines.push(`Já existe no CRM como «${brand.name}».`);
    const { data: opps } = await db
      .from('opportunity')
      .select('id, stage, last_activity_at')
      .eq('brand_id', brand.id);
    const ordenadas = [...(opps ?? [])].sort(
      (a, b) => (AVANCO[b.stage] ?? 0) - (AVANCO[a.stage] ?? 0),
    );
    if (ordenadas[0]) {
      opportunityStage = ordenadas[0].stage;
      opportunityId = ordenadas[0].id;
      const { STAGE_LABEL } = await import('@/modules/opportunities/domain');
      const rotulo = STAGE_LABEL[opportunityStage as keyof typeof STAGE_LABEL] ?? opportunityStage;
      const quando = dataCurta(ordenadas[0].last_activity_at);
      lines.push(`Oportunidade em «${rotulo}»${quando ? `, mexida a ${quando}` : ''}.`);
    }
  }

  // ── Já saiu uma abordagem daqui de dentro ───────────────────────────────
  const { data: enviadas } = await db
    .from('outreach_candidate')
    .select('sent_at, subject')
    .eq('status', 'sent')
    .eq('normalized_name', normalized)
    .order('sent_at', { ascending: false })
    .limit(1);
  const enviada = enviadas?.[0] ?? null;
  if (enviada) {
    const quando = dataCurta(enviada.sent_at);
    lines.push(`O CarolOS já enviou uma abordagem${quando ? ` a ${quando}` : ''}.`);
  }

  // ── Lista de não contatar ───────────────────────────────────────────────
  const { data: supressoes } = await db
    .from('outreach_suppression')
    .select('kind, until, reason')
    .eq('normalized_name', normalized)
    .limit(1);
  const s = supressoes?.[0] ?? null;
  const suppressed = Boolean(
    s && (s.kind === 'never' || (s.until ? new Date(s.until) > new Date() : false)),
  );
  if (suppressed) {
    lines.push(s?.reason ? `Não contatar: ${s.reason}` : 'Está na lista de não contatar.');
  }

  // ── O Gmail, que é o único que sabe o que houve antes do CarolOS ────────
  const gmail = domain ? await gmailHasHistory(domain) : SEM_GMAIL;
  if (gmail.found) {
    const quando = dataCurta(gmail.lastAt);
    lines.push(
      `Há email com este domínio${quando ? `, o último a ${quando}` : ''}${
        gmail.theyReplied ? ' — e eles responderam' : ' — sem resposta deles'
      }.`,
    );
  }
  // Sem domínio não há como perguntar ao Gmail: a pergunta é por domínio.
  const dedupComplete = domain ? gmail.checked : false;
  if (!dedupComplete) {
    lines.push(
      domain
        ? 'Não consegui confirmar no Gmail se já houve conversa.'
        : 'Sem domínio confirmado, não consegui perguntar ao Gmail.',
    );
  }

  const evidence: DedupEvidence = {
    identityCertain: input.identityCertain,
    suppressed,
    brandFound: Boolean(brand),
    opportunityStage,
    outreachSent: Boolean(enviada),
    gmail: {
      checked: gmail.checked,
      found: gmail.found,
      theyReplied: gmail.theyReplied,
      waitingReply: gmail.waitingReply,
    },
  };

  return {
    ...classifyResolution(evidence),
    evidence,
    dedupComplete,
    lines,
    brandId: brand?.id ?? null,
    opportunityId,
    gmail,
  };
}

/** O que se conta ao modelo quando a abordagem é uma reabordagem. Factual e
 *  curto: o que houve e quando, sem interpretação. */
export function historyBrief(d: DedupResult): string {
  const linhas = [...d.lines];
  if (d.gmail.subjects.length) {
    linhas.push(`Assuntos anteriores: ${d.gmail.subjects.slice(0, 3).join(' · ')}.`);
  }
  return linhas.join('\n') || 'Sem detalhes do histórico.';
}
