import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { normalizeDomain } from '@/modules/brands/identity';
import type { Known } from './domain';

/** Quem já é conhecido — e a pergunta que tem de ser feita antes de tratar uma
 *  marca como nova: «a Carol já teve alguma conversa comercial com esta gente?»
 *
 *  Três fontes, porque o CRM só sabe o que nasceu dentro dele. A Carol trabalha
 *  há mais tempo do que o CarolOS existe, e abordar outra vez uma marca com quem
 *  já falou é a forma mais rápida de parecer que não sabe o que anda fazendo. */

export type KnownSet = Known & {
  /** Se o Gmail não respondeu, não se pode afirmar que uma marca é nova. */
  complete: boolean;
  reason: string | null;
};

export async function buildKnownSet(): Promise<KnownSet> {
  const db = supabaseService();

  const [brands, contacts, suppressed, candidates, threads] = await Promise.all([
    db.from('brand').select('normalized_name, domain, website_url'),
    db.from('contact').select('email'),
    db.from('outreach_suppression').select('normalized_name, domain, kind, until'),
    // O que já saiu num lote recente não volta a sair amanhã.
    db.from('outreach_candidate').select('normalized_name, domain').gte(
      'created_at',
      new Date(Date.now() - 60 * 86400000).toISOString(),
    ),
    // Conversas já ingeridas: o histórico do Gmail que o CarolOS já leu.
    db.from('source_thread').select('participants').limit(2000),
  ]);

  const names = new Set<string>();
  const domains = new Set<string>();
  const snoozed = new Map<string, string>();

  for (const b of brands.data ?? []) {
    if (b.normalized_name) names.add(b.normalized_name);
    const d = normalizeDomain(b.domain ?? b.website_url);
    if (d) domains.add(d);
  }

  for (const c of candidates.data ?? []) {
    if (c.normalized_name) names.add(c.normalized_name);
    if (c.domain) domains.add(c.domain);
  }

  // Os domínios com quem ela já trocou email contam como conhecidos, mesmo que
  // nunca tenham virado marca no CRM.
  for (const c of contacts.data ?? []) {
    const d = normalizeDomain(c.email?.split('@')[1] ?? null);
    if (d) domains.add(d);
  }

  for (const t of threads.data ?? []) {
    for (const p of (t.participants ?? []) as string[]) {
      const d = normalizeDomain(p.split('@')[1] ?? null);
      if (d) domains.add(d);
    }
  }

  for (const s of suppressed.data ?? []) {
    const n = s.normalized_name;
    if (!n) continue;
    if (s.kind === 'never') names.add(n);
    else if (s.until) snoozed.set(n, s.until);
    if (s.domain) domains.add(s.domain);
  }

  const failed = [brands, contacts, suppressed, candidates, threads].find((r) => r.error);

  return {
    normalizedNames: names,
    domains,
    snoozed,
    complete: !failed,
    reason: failed?.error?.message ?? null,
  };
}

/** Pergunta direta ao Gmail, para uma marca concreta.
 *
 *  A ingestão só salva o que já sincronizou. Isto vai à caixa perguntar se
 *  existe qualquer mensagem — enviada ou recebida — com aquele domínio, que é
 *  a única forma de apanhar uma conversa anterior ao CarolOS. */
export async function gmailHasHistory(
  domain: string,
): Promise<{ found: boolean; checked: boolean; subjects: string[] }> {
  try {
    const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
    const { listMessages, getMessage, parseMessage } = await import('@/modules/integrations/gmail/client');

    const auth = await accessTokenFor();
    if (!auth) return { found: false, checked: false, subjects: [] };

    const { messages } = await listMessages(auth.token, `from:${domain} OR to:${domain}`, 5);
    if (messages.length === 0) return { found: false, checked: true, subjects: [] };

    const subjects: string[] = [];
    for (const ref of messages.slice(0, 3)) {
      const parsed = parseMessage(await getMessage(auth.token, ref.id));
      subjects.push(parsed.subject || '(sem assunto)');
    }
    return { found: true, checked: true, subjects };
  } catch {
    // Falhar a verificação não é o mesmo que não haver histórico. Quem chama
    // trata `checked: false` como «não sei», e não como «é nova».
    return { found: false, checked: false, subjects: [] };
  }
}
