import 'server-only';

import { formatMoney, type Currency } from '@/lib/money';
import { localDay } from '@/lib/time';
import { asJson } from '@/lib/supabase/json';
import { hasServiceRole, supabaseService } from '@/lib/supabase/service';
import { repliesWaiting } from '@/modules/email/triage-service';
import { todayContent } from '@/modules/creator/plan-service';
import {
  EMPTY_PREPARED,
  briefStatus,
  describePrepared,
  estimateMinutes,
  headline,
  orderDecisions,
  type Decision,
  type Gap,
  type PreparedCounts,
} from './domain';

export * from './domain';

/** A consolidação da manhã.
 *
 *  Não é mais um trabalho: é o que junta o que os outros produziram e decide o
 *  que chega à Carol. Sem isto havia quinze crons a produzir quinze
 *  experiências desligadas, que é exactamente o que o Hoje já era.
 *
 *  Corre por último, e é honesta: o que não correu fica escrito em `gaps` e
 *  aparece na tela. Fingir que a manhã correu bem quando a pesquisa de marcas
 *  falhou é a forma mais rápida de ela deixar de acreditar no resto. */

export type MorningBrief = {
  date: string;
  status: 'building' | 'ready' | 'partial' | 'failed';
  headline: string;
  decisions: Decision[];
  decisionCount: number;
  estimatedMinutes: number;
  prepared: PreparedCounts;
  preparedLines: string[];
  gaps: Gap[];
  openedAt: string | null;
  completedAt: string | null;
};

export async function consolidateMorning(opts: { now?: Date } = {}): Promise<MorningBrief | null> {
  // Sem chave de service role não há manhã — e é melhor devolver nada do que
  // rebentar a tela toda. É a mesma variável que já bloqueia o agendador.
  if (!hasServiceRole()) return null;
  const db = supabaseService();
  const now = opts.now ?? new Date();
  const date = localDay(now);

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return null;

  const [decisions, prepared, gaps] = await Promise.all([
    collectDecisions(now),
    countPrepared(now),
    collectGaps(now),
  ]);

  const ordered = orderDecisions(decisions);
  const minutes = estimateMinutes(ordered, await historicMinutes());
  const status = briefStatus(prepared, gaps);

  const linha = headline({ decisions: ordered, prepared, gaps, minutes });

  await db.from('morning_brief').upsert(
    {
      app_user_id: me.id,
      brief_date: date,
      status,
      prepared: asJson(prepared),
      gaps: asJson(gaps),
      decisions: asJson(ordered),
      decision_count: ordered.length,
      estimated_minutes: minutes,
      headline: linha,
      updated_at: now.toISOString(),
    },
    { onConflict: 'app_user_id,brief_date' },
  );

  return {
    date,
    status,
    headline: linha,
    decisions: ordered,
    decisionCount: ordered.length,
    estimatedMinutes: minutes,
    prepared,
    preparedLines: describePrepared(prepared),
    gaps,
    openedAt: null,
    completedAt: null,
  };
}

/** O que o Hoje lê. Nunca calcula nada: lê o que a noite deixou.
 *
 *  Se a consolidação não correu — o cron está desligado, ou falhou — devolve
 *  `null` e o Hoje mostra a fila antiga. Não se inventa uma manhã. */
export async function readMorningBrief(opts: { now?: Date } = {}): Promise<MorningBrief | null> {
  if (!hasServiceRole()) return null;
  const db = supabaseService();
  const now = opts.now ?? new Date();
  const date = localDay(now);

  const { data } = await db
    .from('morning_brief')
    .select('brief_date, status, prepared, gaps, decisions, decision_count, estimated_minutes, headline, opened_at, completed_at')
    .eq('brief_date', date)
    .maybeSingle();

  if (!data) return null;

  const prepared = { ...EMPTY_PREPARED, ...((data.prepared ?? {}) as Partial<PreparedCounts>) };
  return {
    date: data.brief_date,
    status: data.status as MorningBrief['status'],
    headline: data.headline,
    decisions: (data.decisions ?? []) as Decision[],
    decisionCount: data.decision_count,
    estimatedMinutes: data.estimated_minutes ?? 1,
    prepared,
    preparedLines: describePrepared(prepared),
    gaps: (data.gaps ?? []) as Gap[],
    openedAt: data.opened_at,
    completedAt: data.completed_at,
  };
}

export async function markMorningOpened(now: Date = new Date()): Promise<void> {
  if (!hasServiceRole()) return;
  const db = supabaseService();
  await db
    .from('morning_brief')
    .update({ opened_at: now.toISOString() })
    .eq('brief_date', localDay(now))
    .is('opened_at', null);
}

export async function markMorningCompleted(now: Date = new Date()): Promise<void> {
  if (!hasServiceRole()) return;
  const db = supabaseService();
  await db
    .from('morning_brief')
    .update({ completed_at: now.toISOString() })
    .eq('brief_date', localDay(now));
}

/* ── As cinco fontes, por ordem de nível ──────────────────────────────────── */

async function collectDecisions(now: Date): Promise<Decision[]> {
  const [replies, money, outreach, recordings, content] = await Promise.all([
    replyDecisions(),
    moneyDecisions(now),
    outreachDecision(),
    recordingDecisions(),
    contentDecisions(now),
  ]);
  return [...replies, ...money, ...outreach, ...recordings, ...content];
}

/** Nível 1: marcas à espera dela, com a resposta já escrita. */
async function replyDecisions(): Promise<Decision[]> {
  const rows = await repliesWaiting(8);
  return rows.map((r) => ({
    id: `reply:${r.threadId}`,
    kind: 'reply' as const,
    subject: r.brandName,
    headline: r.whatTheyWant || `${r.whoWrote} respondeu.`,
    because: r.recommendation,
    covers: 1,
    weightCents: null,
    urgent: r.urgent || r.riskLevel === 'high',
    waitingDays: r.waitingDays,
    minutes: 1,
    href: `/dashboard/inbox?thread=${r.threadId}`,
    payload: {
      threadId: r.threadId,
      brandId: r.brandId,
      opportunityId: r.opportunityId,
      intent: r.intent,
      intentLabel: r.intentLabel,
      whatChanged: r.whatChanged,
      whatIsMissing: r.whatIsMissing,
      risk: r.risk,
      riskLevel: r.riskLevel,
      draftSubject: r.draftSubject,
      draftBody: r.draftBody,
      replyTo: r.replyTo,
    },
  }));
}

/** Nível 2: dinheiro perto. Vencido primeiro, licença a acabar a seguir. */
async function moneyDecisions(now: Date): Promise<Decision[]> {
  const db = supabaseService();
  const hoje = localDay(now);

  const [{ data: overdue }, { data: licenses }] = await Promise.all([
    db
      .from('payment')
      .select('id, amount_cents, currency, due_at, brand_id, brand:brand_id ( name )')
      .in('status', ['due', 'invoiced'])
      .not('due_at', 'is', null)
      .lte('due_at', hoje)
      .order('due_at', { ascending: true })
      .limit(5),
    db
      .from('rights_license')
      .select('id, end_at, brand_id, opportunity_id, brand:brand_id ( name )')
      .eq('status', 'active')
      .not('end_at', 'is', null)
      .lte('end_at', new Date(now.getTime() + 21 * 86_400_000).toISOString().slice(0, 10))
      .order('end_at', { ascending: true })
      .limit(4),
  ]);

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const out: Decision[] = [];

  for (const p of overdue ?? []) {
    const brand = one(p.brand as { name: string } | { name: string }[] | null);
    const dias = Math.max(0, Math.floor((now.getTime() - Date.parse(`${p.due_at}T00:00:00Z`)) / 86_400_000));
    out.push({
      id: `money:${p.id}`,
      kind: 'money',
      subject: brand?.name ?? 'Marca',
      headline: `${formatMoney(p.amount_cents, p.currency as Currency)} venceu há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`,
      because: 'Um valor vencido em silêncio raramente se cobra sozinho.',
      covers: 1,
      weightCents: p.amount_cents,
      urgent: dias >= 7,
      waitingDays: dias,
      minutes: 1,
      href: `/dashboard/revenue`,
      payload: { paymentId: p.id, brandId: p.brand_id, amountCents: p.amount_cents, currency: p.currency },
    });
  }

  for (const l of licenses ?? []) {
    const brand = one(l.brand as { name: string } | { name: string }[] | null);
    const dias = Math.max(0, Math.floor((Date.parse(`${l.end_at}T00:00:00Z`) - now.getTime()) / 86_400_000));
    out.push({
      id: `rights:${l.id}`,
      kind: 'money',
      subject: brand?.name ?? 'Marca',
      headline: `A licença acaba daqui a ${dias} ${dias === 1 ? 'dia' : 'dias'}.`,
      because: 'Uma licença que expira em silêncio é receita que se perde sem ninguém dar por ela.',
      covers: 1,
      weightCents: null,
      urgent: dias <= 7,
      waitingDays: null,
      minutes: 1,
      href: l.opportunity_id ? `/dashboard/opportunities/${l.opportunity_id}` : '/dashboard/revenue',
      payload: { licenseId: l.id, brandId: l.brand_id, endsAt: l.end_at },
    });
  }

  return out;
}

/** Nível 3: prospecção. Um cartão para o lote todo — seis emails prontos não
 *  são seis decisões, são uma revisão. */
async function outreachDecision(): Promise<Decision[]> {
  const db = supabaseService();
  const { count } = await db
    .from('outreach_candidate')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ready');

  const n = count ?? 0;
  if (n === 0) return [];

  const { count: comReferencias } = await db
    .from('outreach_candidate')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ready')
    .eq('references_state', 'done');

  return [
    {
      id: 'outreach:batch',
      kind: 'outreach_batch',
      subject: 'Marcas novas',
      headline: n === 1 ? 'Tenho um email de prospecção pronto.' : `Tenho ${n} emails de prospecção prontos.`,
      because:
        (comReferencias ?? 0) > 0
          ? `${comReferencias} destas marcas já têm referências e um conceito separado.`
          : 'Escritos de madrugada, com o encaixe já calculado.',
      covers: n,
      weightCents: null,
      urgent: false,
      waitingDays: null,
      minutes: 3,
      href: '/dashboard/outreach',
      payload: { count: n, withReferences: comReferencias ?? 0 },
    },
  ];
}

/** Nível 4: produção para marcas. Só o que está mesmo pronto a gravar. */
async function recordingDecisions(): Promise<Decision[]> {
  const db = supabaseService();
  const { data } = await db
    .from('collaboration')
    .select('id, title, status, deadline_at, brand:brand_id ( name )')
    .in('status', ['production_ready', 'in_production'])
    .limit(3);

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (data ?? []).map((c) => {
    const brand = one(c.brand as { name: string } | { name: string }[] | null);
    return {
      id: `recording:${c.id}`,
      kind: 'recording' as const,
      subject: brand?.name ?? 'Marca',
      headline: c.title || 'A gravação está pronta a começar.',
      because: c.deadline_at ? `Entrega marcada para ${c.deadline_at}.` : 'O guião e a lista de tomadas já existem.',
      covers: 1,
      weightCents: null,
      urgent: false,
      waitingDays: null,
      minutes: 2,
      href: `/dashboard/production/${c.id}`,
      payload: { collaborationId: c.id },
    };
  });
}

/** Nível 5: conteúdo dela. No máximo dois — um por plataforma.
 *
 *  Doze tendências pesquisadas não são doze cartões. São isto. */
async function contentDecisions(now: Date): Promise<Decision[]> {
  const ideas = await todayContent(now);
  return ideas.map((i) => ({
    id: `content:${i.id}`,
    kind: 'content' as const,
    subject: i.platform === 'instagram' ? 'Instagram' : 'TikTok',
    headline: i.title || i.hook,
    because: i.whyNow,
    covers: 1,
    weightCents: null,
    urgent: false,
    waitingDays: null,
    minutes: 2,
    href: `/dashboard/content?idea=${i.id}`,
    payload: {
      ideaId: i.id,
      platform: i.platform,
      hook: i.hook,
      recordMinutes: i.recordMinutes,
      editMinutes: i.editMinutes,
      verdict: i.verdict,
      pillarLabel: i.pillarLabel,
    },
  }));
}

/* ── Prova de vida e falhas ───────────────────────────────────────────────── */

/** O que os trabalhos da noite produziram, contado a partir do que ficou
 *  gravado — não a partir do que se esperava que produzissem. */
async function countPrepared(now: Date): Promise<PreparedCounts> {
  const db = supabaseService();
  const desde = new Date(now.getTime() - 18 * 3_600_000).toISOString();
  const hoje = localDay(now);

  const [
    { count: brands },
    { count: references },
    { count: threads },
    { count: replies },
    { count: trends },
    { count: ideas },
    { data: syncs },
    { count: cancelled },
    { count: stages },
  ] = await Promise.all([
    // Só as que a procura da manhã trouxe. Contar tudo o que entrou em 18h
    // incluía as buscas dirigidas que ela própria pediu, e a primeira
    // consolidação real anunciou «encontrei 57 marcas» quando o que havia para
    // rever eram sete. Uma prova de vida inflacionada vale menos do que nenhuma.
    db
      .from('outreach_candidate')
      .select('id, run:run_id!inner ( kind )', { count: 'exact', head: true })
      .gte('created_at', desde)
      .eq('run.kind', 'daily'),
    db.from('candidate_reference').select('id', { count: 'exact', head: true }).gte('created_at', desde),
    db.from('thread_intel').select('id', { count: 'exact', head: true }).gte('prepared_at', desde),
    db
      .from('thread_intel')
      .select('id', { count: 'exact', head: true })
      .gte('prepared_at', desde)
      .eq('draft_state', 'ready'),
    db.from('creator_trend').select('id', { count: 'exact', head: true }).gte('detected_at', desde),
    // Só as que ainda valem: contar as descartadas dava «escolhi 4 conteúdos»
    // num dia em que há dois para gravar.
    db
      .from('creator_content_idea')
      .select('id', { count: 'exact', head: true })
      .eq('plan_date', hoje)
      .in('status', ['ready', 'saved', 'recorded', 'published']),
    db
      .from('job_run')
      // `started_at`, não `created_at`: a tabela não tem essa coluna. A consulta
      // devolvia erro em silêncio e a prova de vida dizia «0 caixas» num dia em
      // que sincronizou duas. É o mesmo engano que já tinha corrigido nas falhas
      // e deixei ficar aqui.
      .select('detail')
      .eq('job_type', 'gmail-sync')
      .eq('status', 'success')
      .gte('started_at', desde)
      .limit(10),
    db
      .from('follow_up')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gte('updated_at', desde),
    db
      .from('activity_event')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'opportunity.stage_changed')
      .gte('occurred_at', desde),
  ]);

  // Quantas caixas foram sincronizadas.
  //
  // O relatório da sincronização não traz uma lista de contas: traz uma frase
  // com os endereços lá dentro, «a@x.com: … · b@x.com: …». Procurava-se um
  // campo `accounts` que nunca existiu, e a primeira consolidação real disse
  // «0 caixas» num dia em que sincronizou duas.
  const caixas = new Set<string>();
  for (const s of syncs ?? []) {
    const detail = (s.detail ?? {}) as { detail?: unknown; accounts?: unknown };
    for (const a of Array.isArray(detail.accounts) ? detail.accounts : []) caixas.add(String(a));
    if (typeof detail.detail === 'string') {
      for (const m of detail.detail.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) caixas.add(m[0].toLowerCase());
    }
  }

  return {
    brandsFound: brands ?? 0,
    referencesFound: references ?? 0,
    threadsOrganized: threads ?? 0,
    repliesPrepared: replies ?? 0,
    trendsFound: trends ?? 0,
    contentIdeas: ideas ?? 0,
    mailboxesSynced: caixas.size,
    followUpsCancelled: cancelled ?? 0,
    stagesUpdated: stages ?? 0,
  };
}

/** O que falhou, dito por palavras.
 *
 *  «Não consegui terminar a pesquisa de marcas hoje» é uma frase; um código de
 *  erro não é. E uma integração em baixo não bloqueia o resto: cada área
 *  reporta a sua. */
const AREA_LABEL: Record<string, string> = {
  'gmail-sync': 'as conversas do Gmail',
  triage: 'a triagem dos emails',
  outreach: 'a procura de marcas',
  references: 'as referências criativas',
  trends: 'as tendências',
  'content-plan': 'o plano de conteúdo',
  milestones: 'os marcos do negócio',
  insights: 'os avisos',
};

async function collectGaps(now: Date): Promise<Gap[]> {
  const db = supabaseService();
  const desde = new Date(now.getTime() - 18 * 3_600_000).toISOString();

  const { data } = await db
    .from('job_run')
    .select('job_type, status, error_summary, detail, started_at')
    .gte('started_at', desde)
    .order('started_at', { ascending: false })
    .limit(60);

  const vistos = new Set<string>();
  const gaps: Gap[] = [];

  for (const r of data ?? []) {
    if (vistos.has(r.job_type)) continue;
    const detalhe = (r.detail ?? {}) as { failures?: unknown };
    const falhas = Array.isArray(detalhe.failures) ? detalhe.failures.map(String).filter(Boolean) : [];
    // Um sucesso parcial é uma falha para quem estava à espera daquela parte.
    // Sem isto, «encontrei 0 marcas porque a pesquisa devolveu vazio» passava
    // por manhã bem-sucedida.
    if (r.status !== 'error' && falhas.length === 0) continue;

    vistos.add(r.job_type);
    const area = AREA_LABEL[r.job_type] ?? r.job_type;
    gaps.push({
      area: r.job_type,
      message: falhas[0] ?? `Não consegui terminar ${area} esta manhã.`,
    });
  }

  return gaps;
}

/** Quanto tempo cada tipo de decisão costuma custar-lhe, medido.
 *
 *  Ainda não há histórico suficiente para isto valer alguma coisa, e é por isso
 *  que devolve o que tem em vez de um número inventado com três casas. */
async function historicMinutes(): Promise<Partial<Record<Decision['kind'], number>>> {
  const db = supabaseService();
  const { data } = await db
    .from('morning_brief')
    .select('opened_at, completed_at, decision_count')
    .not('completed_at', 'is', null)
    .not('opened_at', 'is', null)
    .order('brief_date', { ascending: false })
    .limit(10);

  const amostras = (data ?? []).filter((b) => b.decision_count > 0);
  if (amostras.length < 3) return {};

  const porDecisao =
    amostras.reduce((sum, b) => {
      const ms = Date.parse(b.completed_at!) - Date.parse(b.opened_at!);
      return sum + ms / 60_000 / b.decision_count;
    }, 0) / amostras.length;

  // Uma média por decisão, aplicada a todas. Fingir uma média por TIPO com dez
  // manhãs de histórico seria precisão a fingir de conhecimento.
  const m = Math.max(1, Math.round(porDecisao));
  return { reply: m, money: m, outreach_batch: m * 2, recording: m, content: m };
}
