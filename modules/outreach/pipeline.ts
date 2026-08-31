import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { scoreBrandFit, type FitSignals } from '@/modules/brands/fit';
import { localDay } from '@/lib/time';
import { dedupe, LIMITS, scoreEmail, selectDaily, strategyFor, suppress, enoughToChooseFrom } from './domain';
import { discoverBrands, type Discovered } from './discovery';
import { buildKnownSet, gmailHasHistory } from './suppression';
import { latestStyleProfile } from './style';

/** A corrida diária.
 *
 *  Em funil, e por essa ordem por causa do custo: descobrir é barato, triar é
 *  barato, pesquisar a fundo é caro e escrever um email é o mais caro de todos.
 *  Ninguém pesquisa cem empresas para escolher oito. */

export type RunResult = {
  runId: string | null;
  status: 'success' | 'partial' | 'empty' | 'error';
  discovered: number;
  screened: number;
  researched: number;
  selected: number;
  failures: string[];
  /** Porque é que a corrida não chegou a andar. Zero marcas porque a pesquisa
   *  não devolveu nada é uma coisa; zero porque a IA nem foi chamada é outra, e
   *  só uma delas se resolve mudando a busca. */
  blocked: string | null;
};

export async function runDailyOutreach(
  opts: { kind?: 'daily' | 'manual' | 'targeted'; ask?: string; date?: Date } = {},
): Promise<RunResult> {
  const db = supabaseService();
  const kind = opts.kind ?? 'daily';
  // A rota morre aos 300s e leva com ela tudo o que a corrida já fez. Parar por
  // decisão própria antes disso guarda o que há e diz o que ficou por fazer.
  const deadline = Date.now() + 4 * 60 * 1000;
  const semTempo = () => Date.now() > deadline;
  const now = opts.date ?? new Date();
  const runDate = localDay(now);
  const failures: string[] = [];

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { runId: null, status: 'error', discovered: 0, screened: 0, researched: 0, selected: 0, failures: ['Sem usuário.'], blocked: 'Sem usuário.' };

  // A corrida diária é idempotente pelo dia: o cron pode disparar duas vezes e
  // não faz dois lotes. Uma busca que ela pediu é outra coisa — pedir duas no
  // mesmo dia é exactamente o que se espera de um botão «procurar agora», e
  // bloqueá-la era o que fazia a busca parecer que não devolvia nada.
  if (kind === 'daily') {
    const { data: existing } = await db
      .from('outreach_run')
      .select('id, status')
      .eq('app_user_id', me.id)
      .eq('run_date', runDate)
      .eq('kind', 'daily')
      .maybeSingle();

    if (existing && existing.status !== 'error') {
      return { runId: existing.id, status: 'success', discovered: 0, screened: 0, researched: 0, selected: 0, failures: [], blocked: 'A procura de hoje já correu. As marcas que ela achou estão na lista.' };
    }
  }

  const recent = await recentNiches(db);
  const strategy = strategyFor(now, recent);

  const { data: run } = await db
    .from('outreach_run')
    .insert({ app_user_id: me.id, run_date: runDate, kind, status: 'running', strategy: strategy as never })
    .select('id')
    .maybeSingle();

  const runId = run?.id ?? null;
  if (!runId) return { runId: null, status: 'error', discovered: 0, screened: 0, researched: 0, selected: 0, failures: ['Não consegui abrir a corrida.'], blocked: 'Não consegui começar a procura.' };

  const finish = async (r: Omit<RunResult, 'runId'>) => {
    await db
      .from('outreach_run')
      .update({
        status: r.status,
        discovered: r.discovered,
        screened: r.screened,
        researched: r.researched,
        selected: r.selected,
        partial_failures: r.failures as never,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    return { runId, ...r };
  };

  // ── 1. Descobrir ────────────────────────────────────────────────────────
  const { found, failure } = await discoverBrands(strategy, opts.ask);
  if (failure) failures.push(failure);
  if (found.length === 0) {
    return finish({ status: failure ? 'error' : 'empty', discovered: 0, screened: 0, researched: 0, selected: 0, failures, blocked: failure });
  }

  // ── 2. Triar: barato antes de caro ──────────────────────────────────────
  const known = await buildKnownSet();
  if (!known.complete) failures.push('Não consegui ler o histórico todo, por isso pode repetir-se alguma marca.');

  const fresh = dedupe(found).filter((c) => !suppress(c, known, now).blocked);

  // O Gmail é a única forma de apanhar uma conversa anterior ao CarolOS. Se não
  // responder, a marca fica marcada e não é tratada como nova sem verificação.
  const screened: Discovered[] = [];
  for (const c of fresh.slice(0, LIMITS.maxDeepResearch * 2)) {
    if (!c.domain) {
      screened.push(c);
      continue;
    }
    const history = await gmailHasHistory(c.domain);
    if (history.found) continue;
    if (!history.checked) failures.push(`Não confirmei no Gmail se já falou com a ${c.name}.`);
    screened.push(c);
  }

  if (screened.length === 0) return finish({ status: 'empty', discovered: found.length, screened: 0, researched: 0, selected: 0, failures, blocked: null });

  // ── 3. Pesquisar a fundo, só as finalistas ──────────────────────────────
  //     O encaixe calcula-se aqui dentro: é o que diz quando já chega.
  const { researchCandidate } = await import('./research');
  const scored = [];
  let qualified = 0;
  for (const c of screened.slice(0, LIMITS.maxDeepResearch)) {
    if (semTempo()) {
      failures.push(`Faltou tempo: parei depois de pesquisar ${scored.length}.`);
      break;
    }
    if (enoughToChooseFrom(qualified)) break;

    const r = await researchCandidate(c);
    if (!r) {
      failures.push(`Não consegui pesquisar a ${c.name}.`);
      continue;
    }
    const fit = scoreBrandFit(r.research.fit_signals as FitSignals);
    if (fit.score >= LIMITS.minFitScore) qualified++;
    scored.push({ ...r, fit });
  }
  const researched = scored;

  // ── 5. Escrever, só para quem passa o corte ─────────────────────────────
  const shortlist = selectDaily(
    scored.map((s) => ({
      ...s,
      fitScore: s.fit.score,
      quality: 0,
      paidMediaSignal: s.research.paid_media_signal,
      emailConfidence: s.research.contact?.confidence ?? 'unknown',
      redFlags: s.research.red_flags,
    })),
  );

  if (shortlist.length === 0) return finish({ status: 'empty', discovered: found.length, screened: screened.length, researched: researched.length, selected: 0, failures, blocked: null });

  const { writeOutreachEmail } = await import('./email');
  const { checkEmail } = await import('./mailcheck-dns');
  const style = await latestStyleProfile('pt');
  const ready = [];

  for (const s of shortlist) {
    if (semTempo()) {
      failures.push(`Faltou tempo: escrevi ${ready.length} de ${shortlist.length} emails.`);
      break;
    }
    // O nível de confiança que o modelo declarou é um palpite. Isto pergunta
    // ao DNS se o domínio recebe email, que é a causa mais comum de devolução.
    const contactEmail = s.research.contact?.email ?? null;
    const check = contactEmail
      ? await checkEmail(
          contactEmail,
          /site|website|página|homepage/i.test(s.research.contact?.source ?? '') ? 'website' : 'research',
        )
      : null;

    const written = await writeOutreachEmail(s, style);
    if (!written) {
      failures.push(`Não consegui escrever o email da ${s.candidate.name}.`);
      continue;
    }
    const quality = scoreEmail({
      subject: written.subject,
      body: written.body,
      brandName: s.candidate.name,
      product: s.research.product,
      claims: written.claims.map((c) => ({ text: c.text, sourceId: c.source })),
    });
    ready.push({ ...s, written, quality, check });
  }

  // Um email que não passa a porta não desaparece: fica para ela decidir, mas
  // marcado. Esconder um lead sem dizer porquê é pior do que mostrá-lo com um
  // aviso.
  const rows = ready.map((r, i) => ({
    run_id: runId,
    name: r.candidate.name,
    normalized_name: r.candidate.normalizedName,
    website: r.candidate.website,
    domain: r.candidate.domain,
    country: r.research.country ?? r.candidate.country,
    niche_id: r.candidate.nicheId,
    socials: {} as never,
    rank: i + 1,
    fit_score: r.fit.score,
    fit_band: r.fit.band,
    fit_breakdown: r.fit.lines as never,
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
    contact_email: r.research.contact?.email ?? null,
    // A verificação real ganha ao que o modelo achou.
    email_confidence: r.check?.confidence ?? r.research.contact?.confidence ?? 'unknown',
    contact_source: r.check
      ? `${r.research.contact?.source ?? 'pesquisa'} · ${r.check.reason}`
      : (r.research.contact?.source ?? null),
    portfolio_match: r.written.portfolio as never,
    language: r.written.language,
    subject: r.written.subject,
    body: r.written.body,
    ai_subject: r.written.subject,
    ai_body: r.written.body,
    quality: r.quality as never,
    status: r.quality.pass ? 'ready' : 'needs_review',
  }));

  if (rows.length) {
    const { error } = await db.from('outreach_candidate').insert(rows);
    if (error) failures.push('Encontrei marcas mas não as consegui guardar.');
  }

  return finish({
    status: failures.length ? 'partial' : 'success',
    blocked: null,
    discovered: found.length,
    screened: screened.length,
    researched: researched.length,
    selected: rows.length,
    failures,
  });
}

/** Os nichos dos últimos dias, para a estratégia não repetir. */
async function recentNiches(db: ReturnType<typeof supabaseService>): Promise<string[]> {
  const { data } = await db
    .from('outreach_candidate')
    .select('niche_id')
    .gte('created_at', new Date(Date.now() - 5 * 86400000).toISOString());
  return [...new Set((data ?? []).map((r) => r.niche_id).filter((v): v is string => Boolean(v)))];
}
