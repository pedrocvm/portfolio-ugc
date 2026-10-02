import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import { STAGE_KEYS, type ContentStage } from '@/modules/content-board/domain';

// O MCP usa o token OAuth da própria Carol. Nada passa por service_role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CarolMcpDb = SupabaseClient<any>;

export type CarolMcpIdentity = {
  db: CarolMcpDb;
  authUser: User;
  appUser: {
    id: string;
    displayName: string;
    email: string;
  };
  claims: Record<string, unknown>;
};

function clientFor(token: string): CarolMcpDb {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as CarolMcpDb;
}

function decodePayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function authenticateCarolMcp(token: string): Promise<CarolMcpIdentity | null> {
  const db = clientFor(token);
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) return null;

  const { data: appUser, error: appError } = await db
    .from('app_user')
    .select('id, display_name, email, active')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (appError || !appUser) return null;

  return {
    db,
    authUser: user,
    appUser: {
      id: appUser.id,
      displayName: appUser.display_name || user.email || 'Carol',
      email: appUser.email || user.email || '',
    },
    claims: decodePayload(token),
  };
}

export const MCP_STAGES = STAGE_KEYS;

export function isContentStage(value: string): value is ContentStage {
  return (STAGE_KEYS as readonly string[]).includes(value);
}

export async function listPillars(db: CarolMcpDb) {
  const { data, error } = await db
    .from('content_pillar')
    .select('id, name, position, active, created_at, updated_at')
    .eq('active', true)
    .order('position')
    .order('created_at');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPillar(db: CarolMcpDb, name: string) {
  const { data: last } = await db
    .from('content_pillar')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('content_pillar')
    .insert({
      name: name.trim(),
      position: (last?.position ?? -1) + 1,
      active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id, name, position, active')
    .maybeSingle();

  if (error || !data) {
    if (error?.code === '23505') throw new Error('Já existe um pilar com esse nome.');
    throw new Error(error?.message ?? 'Não foi possível criar o pilar.');
  }

  return data;
}

export async function renamePillar(db: CarolMcpDb, id: string, name: string) {
  const { data, error } = await db
    .from('content_pillar')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, position, active')
    .maybeSingle();

  if (error || !data) {
    if (error?.code === '23505') throw new Error('Já existe um pilar com esse nome.');
    throw new Error(error?.message ?? 'Não foi possível renomear o pilar.');
  }

  return data;
}

const CONTENT_SELECT =
  'id, pillar_id, format, subject, script, scheduled_for, stage, position, created_at, updated_at, pillar:content_pillar(id, name)';

export async function listContent(
  db: CarolMcpDb,
  input: {
    from?: string;
    to?: string;
    stage?: ContentStage;
    pillarId?: string;
    limit?: number;
  },
) {
  let query = db
    .from('content_board_item')
    .select(CONTENT_SELECT)
    .order('scheduled_for')
    .order('position')
    .order('created_at')
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 250));

  if (input.from) query = query.gte('scheduled_for', input.from);
  if (input.to) query = query.lte('scheduled_for', input.to);
  if (input.stage) query = query.eq('stage', input.stage);
  if (input.pillarId) query = query.eq('pillar_id', input.pillarId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getContent(db: CarolMcpDb, id: string) {
  const { data, error } = await db
    .from('content_board_item')
    .select(CONTENT_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Conteúdo não encontrado.');
  return data;
}

export async function createContent(
  db: CarolMcpDb,
  input: {
    pillarId: string;
    format?: string;
    subject: string;
    script?: string;
    scheduledFor: string;
    stage?: ContentStage;
  },
) {
  const stage = input.stage ?? 'idea';

  const { data: pillar } = await db
    .from('content_pillar')
    .select('id')
    .eq('id', input.pillarId)
    .eq('active', true)
    .maybeSingle();

  if (!pillar) throw new Error('Pilar não encontrado ou inativo.');

  const { data: last } = await db
    .from('content_board_item')
    .select('position')
    .eq('scheduled_for', input.scheduledFor)
    .eq('stage', stage)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('content_board_item')
    .insert({
      pillar_id: input.pillarId,
      format: input.format?.trim() ?? '',
      subject: input.subject.trim(),
      script: input.script ?? '',
      scheduled_for: input.scheduledFor,
      stage,
      position: (last?.position ?? -1) + 1,
      updated_at: new Date().toISOString(),
    })
    .select(CONTENT_SELECT)
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? 'Não foi possível criar o conteúdo.');
  return data;
}

export async function updateContent(
  db: CarolMcpDb,
  id: string,
  patch: {
    pillarId?: string;
    format?: string;
    subject?: string;
    script?: string;
    scheduledFor?: string;
    stage?: ContentStage;
  },
) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.pillarId !== undefined) row.pillar_id = patch.pillarId;
  if (patch.format !== undefined) row.format = patch.format.trim();
  if (patch.subject !== undefined) row.subject = patch.subject.trim();
  if (patch.script !== undefined) row.script = patch.script;
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor;
  if (patch.stage !== undefined) row.stage = patch.stage;

  if (Object.keys(row).length === 1) return getContent(db, id);

  const { data, error } = await db
    .from('content_board_item')
    .update(row)
    .eq('id', id)
    .select(CONTENT_SELECT)
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? 'Não foi possível atualizar o conteúdo.');
  return data;
}

export async function deleteContent(db: CarolMcpDb, id: string) {
  const existing = await getContent(db, id);
  const { error } = await db.from('content_board_item').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return existing;
}
