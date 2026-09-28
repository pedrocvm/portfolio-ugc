/** O Modo Sessão contra a base: lê o que está pronto para produzir, agrupa, e
 *  grava a sessão para ela poder voltar a ela.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import { isPillar, type Pillar } from './editorial';
import { isPackKind, parsePack, type PackKind } from './pack';
import { loneItems, sessionGroups, type SessionGroup, type SessionItem } from './session';

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

const client = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

/** As peças validadas e ainda por gravar, já na forma que o agrupador lê. */
export async function readyItems(c?: StrategyClient): Promise<SessionItem[]> {
  const db = await client(c);
  const { data: propostas } = await db
    .from('content_proposal')
    .select('id, topic_label, angle, pillar_slug, status')
    .in('status', ['ready_to_produce', 'in_production'])
    .order('position');

  const ids = (propostas ?? []).map((p) => p.id);
  const { data: packs } = ids.length
    ? await db
        .from('content_production_pack')
        .select('proposal_id, kind, payload, status, version')
        .in('proposal_id', ids)
        .eq('status', 'validated')
    : { data: [] as never[] };

  const packByProposal = new Map<string, { kind: PackKind; payload: unknown }>();
  for (const pk of packs ?? []) {
    if (!isPackKind(pk.kind)) continue;
    packByProposal.set(pk.proposal_id, { kind: pk.kind, payload: pk.payload });
  }

  return (propostas ?? []).map((p) => {
    const pack = packByProposal.get(p.id);
    const pillar: Pillar = isPillar(p.pillar_slug) ? p.pillar_slug : 'ugc_income';
    return {
      proposalId: p.id,
      title: p.topic_label || p.angle.slice(0, 60),
      pillar,
      packKind: pack?.kind ?? null,
      ...traits(pack, pillar),
    };
  });
}

/** O que o pack diz sobre o setup. Sem pack, o mínimo honesto: o pilar diz se
 *  é preciso sair, e mais nada se assume. */
function traits(
  pack: { kind: PackKind; payload: unknown } | undefined,
  pillar: Pillar,
): Pick<SessionItem, 'screenRecording' | 'speech' | 'needsOuting' | 'assets'> {
  const needsOuting = pillar === 'experiences';
  if (!pack) return { screenRecording: false, speech: 'to_camera', needsOuting, assets: [] };

  const parsed = parsePack(pack.kind, pack.payload);
  if (!parsed.ok) return { screenRecording: false, speech: 'to_camera', needsOuting, assets: [] };

  const b = parsed.pack;
  if (b.kind === 'tech_ugc') {
    return {
      screenRecording: b.body.screenRecordings.length > 0,
      speech: 'to_camera',
      needsOuting: false,
      assets: b.body.screenRecordings.filter((a) => !a.ready).map((a) => a.what),
    };
  }
  if (b.kind === 'spoken_reel') {
    return {
      screenRecording: b.body.assets.some((a) => a.kind === 'screen_recording'),
      speech: 'to_camera',
      needsOuting,
      assets: b.body.assets.filter((a) => !a.ready).map((a) => a.what),
    };
  }
  if (b.kind === 'canvas_ugc') {
    return { screenRecording: false, speech: b.body.lines.length ? 'to_camera' : 'none', needsOuting, assets: [] };
  }
  if (b.kind === 'carousel') {
    return { screenRecording: false, speech: 'none', needsOuting, assets: b.body.assets.filter((a) => !a.ready).map((a) => a.what) };
  }
  if (b.kind === 'photo_sequence') {
    return { screenRecording: false, speech: 'none', needsOuting, assets: [] };
  }
  return { screenRecording: false, speech: 'to_camera', needsOuting, assets: [] };
}

export type SessionView = {
  groups: SessionGroup[];
  alone: SessionItem[];
  saved: { id: string; label: string; checklist: string[]; needsOuting: boolean; status: string }[];
};

export async function sessions(c?: StrategyClient): Promise<SessionView> {
  const db = await client(c);
  const items = await readyItems(db);
  const groups = sessionGroups(items);

  const { data } = await db
    .from('content_session')
    .select('id, label, checklist, needs_outing, status')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  return {
    groups,
    alone: loneItems(items, groups),
    saved: (data ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      checklist: Array.isArray(s.checklist) ? s.checklist.map(String) : [],
      needsOuting: s.needs_outing,
      status: s.status,
    })),
  };
}

/** Grava os grupos como sessões. Idempotente por conteúdo: uma sessão aberta
 *  com as mesmas peças não vira duas. */
export async function buildSession(c?: StrategyClient): Promise<Result<{ sessions: number }>> {
  const db = await client(c);
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return fail('Não encontrei o usuário.');

  const items = await readyItems(db);
  const groups = sessionGroups(items);
  if (groups.length === 0) return { ok: true, data: { sessions: 0 } };

  const { data: abertas } = await db.from('content_session').select('id, label').eq('status', 'open');
  const jaTem = new Set((abertas ?? []).map((s) => s.label));

  let criadas = 0;
  for (const g of groups) {
    if (jaTem.has(g.label)) continue;
    const { data: sessao } = await db
      .from('content_session')
      .insert({
        app_user_id: me.id,
        label: g.label,
        shared: asJson({ traits: g.shared }),
        checklist: asJson(g.checklist),
        needs_outing: g.needsOuting,
      })
      .select('id')
      .maybeSingle();
    if (!sessao) continue;
    await db.from('content_session_item').insert(
      g.items.map((i, n) => ({ session_id: sessao.id, proposal_id: i.proposalId, position: n })),
    );
    criadas += 1;
  }

  return { ok: true, data: { sessions: criadas } };
}

export async function closeSession(sessionId: string): Promise<Result> {
  const db = await client();
  const { error } = await db.from('content_session').update({ status: 'done' }).eq('id', sessionId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}
