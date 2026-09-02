import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { localDay } from '@/lib/time';
import { discoverForIntent } from './discovery';
import { dedupe, suppress } from './domain';
import { buildKnownSet } from './suppression';
import {
  parseManualIntent, relevanceFor, opportunityFor, sameCountry, type ManualIntent,
} from './intent';
import { researchCandidate } from './research';
import { chooseFromResearch } from './mailcheck';
import { asJson } from '@/lib/supabase/json';

/** A busca que ela pediu.
 *
 *  Corre à parte da automática de propósito. A automática procura dentro do
 *  foco configurado e ordena por encaixe tech-first; esta procura o que foi
 *  escrito e ordena por relevância ao pedido. Misturá-las foi o que fez
 *  «hotéis» devolver apps.
 *
 *  Também não salva nada no CRM: uma busca exploratória não tem de sujar a
 *  base. O resultado fica marcado `saved = false` até ela decidir. */

export type ManualResult = {
  runId: string | null;
  intent: ManualIntent;
  terms: string[];
  found: number;
  rejectedIrrelevant: number;
  rejectedCountry: number;
  known: number;
  kept: number;
  failures: string[];
};

/** Quantas se pesquisam a fundo numa busca dirigida. Ela está à espera. */
const MAX_DEEP = 10;

export async function runManualSearch(
  rawQuery: string,
  country: string,
): Promise<ManualResult> {
  const db = supabaseService();
  const intent = parseManualIntent(rawQuery, country);
  const failures: string[] = [];

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) {
    return { runId: null, intent, terms: [], found: 0, rejectedIrrelevant: 0, rejectedCountry: 0, known: 0, kept: 0, failures: ['Sem usuário.'] };
  }

  const { data: run } = await db
    .from('outreach_run')
    .insert({
      app_user_id: me.id,
      run_date: localDay(new Date()),
      kind: 'targeted',
      status: 'running',
      raw_query: intent.rawQuery,
      intent: intent as never,
      countries: [country] as never,
      strategy: {} as never,
    })
    .select('id')
    .single();

  const runId = run?.id ?? null;
  if (!runId) {
    return { runId: null, intent, terms: [], found: 0, rejectedIrrelevant: 0, rejectedCountry: 0, known: 0, kept: 0, failures: ['Não consegui começar a procura.'] };
  }

  const { found, failure, terms } = await discoverForIntent(intent);
  if (failure) failures.push(failure);

  await db.from('outreach_run').update({ search_terms: terms as never }).eq('id', runId);

  // ── O portão. Antes de gastar pesquisa profunda em seja o que for. ────────
  const fresh = dedupe(found);
  const relevantes: typeof fresh = [];
  let rejectedIrrelevant = 0;
  let rejectedCountry = 0;

  for (const c of fresh) {
    if (!relevanceFor(c, intent).passes) {
      rejectedIrrelevant++;
      continue;
    }
    // O país tem de vir de prova, não de o site estar em português.
    if (c.country && !sameCountry(c.country, country)) {
      rejectedCountry++;
      continue;
    }
    relevantes.push(c);
  }

  // Numa busca dirigida, já conhecida não desaparece: aparece marcada. Sumir
  // com ela era esconder informação que é útil justamente por já existir.
  const known = await buildKnownSet();
  let jaConhecidas = 0;
  for (const c of relevantes) {
    if (suppress(c, known, new Date()).blocked) jaConhecidas++;
  }

  const finish = async (kept: number, status: string) => {
    {
      await db
        .from('outreach_run')
        .update({
          status,
          discovered: found.length,
          screened: relevantes.length,
          researched: kept,
          selected: kept,
          rejected_irrelevant: rejectedIrrelevant,
          rejected_country: rejectedCountry,
          rejected_known: jaConhecidas,
          partial_failures: failures as never,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }
    return {
      runId, intent, terms, found: found.length,
      rejectedIrrelevant, rejectedCountry, known: jaConhecidas, kept, failures,
    };
  };

  if (relevantes.length === 0) return finish(0, failure ? 'error' : 'empty');

  // ── Só agora se gasta pesquisa a sério, e só nas que passaram ─────────────
  const rows = [];
  for (const c of relevantes.slice(0, MAX_DEEP)) {
    const r = await researchCandidate(c);
    if (!r) {
      failures.push(`Não consegui pesquisar a ${c.name}.`);
      continue;
    }

    const rel = relevanceFor(c, intent);
    const opp = opportunityFor({
      paidMedia: r.research.paid_media_signal,
      ugc: r.research.ugc_signal,
      demonstrable: r.research.fit_signals?.demo_potential ?? null,
      creativeGap: r.research.fit_signals?.authentic_context ?? null,
      digitalPresence: r.research.fit_signals?.paid_maturity ?? null,
      reachable: Boolean(
        chooseFromResearch(r.research.contact).chosen ||
          r.research.contact?.whatsapp ||
          r.research.contact?.instagram,
      ),
      sameLanguage: true,
    });

    rows.push({
      run_id: runId,
      name: c.name,
      normalized_name: c.normalizedName,
      website: c.website,
      domain: c.domain,
      city: r.research.city?.trim() || null,
      country: r.research.country ?? c.country ?? country,
      niche_id: c.nicheId,
      socials: (r.research.socials ?? {}) as never,
      instagram: r.research.contact?.instagram ?? r.research.socials?.instagram ?? null,
      whatsapp: r.research.contact?.whatsapp ?? null,
      linkedin: r.research.socials?.linkedin ?? null,
      rank: rows.length + 1,
      search_relevance: rel.score,
      ugc_opportunity: opp.score,
      fit_score: opp.score,
      fit_band: opp.band,
      fit_breakdown: opp.lines as never,
      product: r.research.product,
      why_fit: r.research.why_fit,
      why_now: r.research.why_now,
      why_may_pay: r.research.why_may_pay,
      risk: r.research.risk,
      paid_media_signal: r.research.paid_media_signal,
      ugc_signal: r.research.ugc_signal,
      creative_opportunity: r.research.creative_opportunity,
      content_ideas: r.research.content_ideas as never,
      red_flags: r.research.red_flags as never,
      sources: r.research.sources as never,
      researched_at: new Date().toISOString(),
      contact_name: r.research.contact?.name ?? null,
      contact_role: r.research.contact?.role ?? null,
      contact_email: chooseFromResearch(r.research.contact).chosen?.address ?? null,
      contact_email_options: asJson(chooseFromResearch(r.research.contact).alternatives),
      email_confidence: r.research.contact?.confidence ?? 'unknown',
      contact_source: r.research.contact?.source ?? null,
      language: 'pt',
      subject: '',
      body: '',
      ai_subject: '',
      ai_body: '',
      status: 'researched',
      saved: false,
    });
  }

  // Ordenada por relevância ao pedido, que é a pergunta que ela fez.
  rows.sort((a, b) => (b.search_relevance ?? 0) - (a.search_relevance ?? 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  if (rows.length) {
    const { error } = await db.from('outreach_candidate').insert(rows);
    if (error) failures.push('Encontrei marcas mas não as consegui salvar.');
  }

  return finish(rows.length, failures.length ? 'partial' : 'success');
}
