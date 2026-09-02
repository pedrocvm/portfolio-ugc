import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { buildInsights, type Insight } from './insights';

/** Alimenta o motor de insights com o estado real e salva o resultado.
 *
 *  Corre no agendador do Supabase, não à espera de ela abrir a aplicação — é
 *  esse o ponto de um aviso proativo. Idempotente pela chave de deduplicação:
 *  correr duas vezes no mesmo dia não duplica nada. */
export async function refreshInsights(): Promise<{ created: number; closed: number }> {
  const db = supabaseService();
  const now = new Date();

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { created: 0, closed: 0 };

  const [opps, follows, rights, payments, delivered] = await Promise.all([
    db.from('opportunity')
      .select('id, stage, last_activity_at, waiting_until, expected_cash_cents, brand_id, brand:brand_id ( name )')
      .not('stage', 'in', '(won,lost)'),
    db.from('follow_up')
      .select('id, due_at, opportunity_id, brand:brand_id ( name )')
      .in('status', ['scheduled', 'due']),
    db.from('rights_license')
      .select('id, end_at, opportunity_id, brand:brand_id ( name )')
      .eq('status', 'active'),
    db.from('payment')
      .select('id, amount_cents, due_at, brand:brand_id ( name )')
      .in('status', ['due', 'invoiced'])
      .eq('kind', 'cash'),
    // A entrega vive no `deliverable`, não na colaboração: uma colaboração
    // pode ter várias entregas e é a última que abre a janela de upsell.
    db.from('deliverable')
      .select('id, delivered_at, collaboration:collaboration_id ( id, brand_id, brand:brand_id ( name ) )')
      .not('delivered_at', 'is', null)
      .order('delivered_at', { ascending: false })
      .limit(40),
  ]);

  const name = (b: unknown) => {
    const v = b as { name: string } | { name: string }[] | null;
    return (Array.isArray(v) ? v[0]?.name : v?.name) ?? 'marca sem nome';
  };

  const insights = buildInsights({
    now,
    opportunities: (opps.data ?? []).map((o) => ({
      id: o.id, brandId: o.brand_id, brandName: name(o.brand), stage: o.stage,
      lastActivityAt: o.last_activity_at, waitingUntil: o.waiting_until,
      expectedCashCents: o.expected_cash_cents,
    })),
    followUps: (follows.data ?? []).map((f) => ({
      id: f.id, brandName: name(f.brand), dueAt: f.due_at, opportunityId: f.opportunity_id,
    })),
    rights: (rights.data ?? []).map((r) => ({
      id: r.id, brandName: name(r.brand), endAt: r.end_at, opportunityId: r.opportunity_id,
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id, brandName: name(p.brand), amountCents: p.amount_cents ?? 0, dueAt: p.due_at,
    })),
    delivered: (delivered.data ?? []).map((d) => {
      const c = d.collaboration as { id: string; brand_id: string | null; brand: unknown } | null;
      return {
        id: d.id,
        brandName: name(c?.brand),
        deliveredAt: d.delivered_at as string,
        brandId: c?.brand_id ?? null,
      };
    }),
  });

  const rows = insights.map((i: Insight) => ({
    app_user_id: me.id,
    kind: i.kind, severity: i.severity, title: i.title, detail: i.detail, href: i.href,
    brand_id: i.brandId, opportunity_id: i.opportunityId, dedupe_key: i.dedupeKey,
    status: 'open',
  }));

  if (rows.length) {
    // `ignoreDuplicates`: se o aviso já lá está, o estado dela — visto ou
    // dispensado — não pode ser reposto para «aberto» por uma nova passagem.
    const { error } = await db
      .from('assistant_insight')
      .upsert(rows, { onConflict: 'app_user_id,dedupe_key', ignoreDuplicates: true });
    if (error) throw new Error(`refreshInsights: ${error.message}`);
  }

  // O que deixou de ser verdade fecha-se sozinho: uma marca que respondeu não
  // pode continuar a aparecer como parada.
  const live = new Set(insights.map((i) => i.dedupeKey));
  const { data: open } = await db
    .from('assistant_insight')
    .select('id, dedupe_key')
    .eq('app_user_id', me.id)
    .eq('status', 'open');

  const stale = (open ?? []).filter((r) => !live.has(r.dedupe_key)).map((r) => r.id);
  if (stale.length) {
    await db.from('assistant_insight').update({ status: 'resolved' }).in('id', stale);
  }

  return { created: rows.length, closed: stale.length };
}
