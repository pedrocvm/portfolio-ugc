import 'server-only';

import type { Flags } from '@/lib/flags';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { ingestMessage, type NormalizedMessage } from '@/modules/inbox/ingest';
import { GmailError, getMessage, getProfile, listHistory, listMessages, parseMessage } from './client';
import { accessTokenFor, listMailboxes, markError, updateCursor, type Mailbox } from './oauth';

/** Sincronização incremental do Gmail.
 *
 *  Duas regras que definem o desenho:
 *   1. o cursor só avança depois de o processamento ter durado. Se o trabalho
 *      morrer a meio, a próxima corrida repete — e repetir é seguro porque a
 *      ingestão é idempotente. Avançar antes perdia mensagens em silêncio.
 *   2. a caixa toda nunca é lida. A primeira sincronização é limitada por
 *      janela e por número; as seguintes usam o histórico do fornecedor. */

/** Fora da conversa comercial: promoções, redes sociais, fóruns, spam e lixo.
 *  Ingerenciar a caixa inteira seria salvar muito mais dados pessoais do que a
 *  operação precisa. */
const BASE_QUERY =
  '-in:spam -in:trash -in:draft -category:promotions -category:social -category:forums';

const FIRST_RUN_WINDOW = 'newer_than:60d';
const FIRST_RUN_LIMIT = 120;
const INCREMENTAL_LIMIT = 60;

export type SyncReport = {
  /** Qual caixa. Null no relatório agregado, que fala de todas. */
  mailbox: string | null;
  status: 'success' | 'error' | 'skipped';
  processed: number;
  created: number;
  duplicates: number;
  needsReview: number;
  irrelevant: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  detail: string;
};

/** Percorre todas as caixas ligadas. Sincronizar só a primeira era o que
 *  acontecia antes de haver duas, e deixaria a segunda conta muda sem nada no
 *  tela a dizer porquê. Uma caixa a falhar não impede as outras. */
export async function syncGmail(flags: Flags, options: { limit?: number } = {}): Promise<SyncReport> {
  if (!flags.gmail_ingestion) {
    return { ...EMPTY, detail: 'o interruptor «Ingestão do Gmail» está desligado.' };
  }

  const mailboxes = await listMailboxes();
  if (mailboxes.length === 0) {
    return { ...EMPTY, status: 'error', detail: 'Sem ligação válida ao Gmail.' };
  }

  const reports: SyncReport[] = [];
  for (const mailbox of mailboxes) {
    reports.push(await syncMailbox(flags, mailbox, options));
  }

  const sum = (pick: (r: SyncReport) => number) => reports.reduce((t, r) => t + pick(r), 0);

  return {
    mailbox: null,
    status: reports.some((r) => r.status === 'error')
      ? 'error'
      : reports.some((r) => r.status === 'success')
        ? 'success'
        : 'skipped',
    processed: sum((r) => r.processed),
    created: sum((r) => r.created),
    duplicates: sum((r) => r.duplicates),
    needsReview: sum((r) => r.needsReview),
    irrelevant: sum((r) => r.irrelevant),
    cursorBefore: null,
    cursorAfter: null,
    detail: reports.map((r) => `${r.mailbox}: ${r.detail || r.status}`).join(' · '),
  };
}

const EMPTY: SyncReport = {
  mailbox: null,
  status: 'skipped',
  processed: 0,
  created: 0,
  duplicates: 0,
  needsReview: 0,
  irrelevant: 0,
  cursorBefore: null,
  cursorAfter: null,
  detail: '',
};

async function syncMailbox(flags: Flags, mailbox: Mailbox, options: { limit?: number } = {}): Promise<SyncReport> {
  const blank: SyncReport = {
    mailbox: mailbox.account,
    status: 'skipped',
    processed: 0,
    created: 0,
    duplicates: 0,
    needsReview: 0,
    irrelevant: 0,
    cursorBefore: null,
    cursorAfter: null,
    detail: '',
  };

  if (!flags.gmail_ingestion) {
    return { ...blank, detail: 'o interruptor «Ingestão do Gmail» está desligado.' };
  }

  const auth = await accessTokenFor(mailbox.id);
  if (!auth) {
    return { ...blank, status: 'error', detail: 'Sem token válido.' };
  }

  const db = supabaseService();
  const started = new Date().toISOString();
  // A caixa entra na chave: sem ela, a segunda conta a correr no mesmo minuto
  // colidia com a unicidade de job_run e ficava sem registro.
  const idempotencyKey = `gmail-sync:${mailbox.id}:${started.slice(0, 16)}`;

  const { data: connection } = await db
    .from('integration_connection')
    .select('cursor')
    .eq('id', auth.connectionId)
    .maybeSingle();

  const cursorBefore = connection?.cursor ?? null;

  const { data: job } = await db
    .from('job_run')
    .insert({
      job_type: 'gmail-sync',
      idempotency_key: idempotencyKey,
      cursor_before: cursorBefore,
      status: 'running',
    })
    .select('id')
    .maybeSingle();

  const finish = async (report: SyncReport) => {
    if (job) {
      await db
        .from('job_run')
        .update({
          finished_at: new Date().toISOString(),
          status: report.status === 'skipped' ? 'skipped' : report.status,
          items_processed: report.processed,
          cursor_after: report.cursorAfter,
          detail: asJson({
            created: report.created,
            duplicates: report.duplicates,
            needsReview: report.needsReview,
            irrelevant: report.irrelevant,
          }),
          error_summary: report.status === 'error' ? report.detail.slice(0, 500) : null,
        })
        .eq('id', job.id);
    }
    return report;
  };

  try {
    const profile = await getProfile(auth.token);
    const self = [profile.emailAddress.toLowerCase()];

    let refs: { id: string; threadId: string }[] = [];
    let nextCursor = profile.historyId;

    if (!cursorBefore) {
      const first = await listMessages(
        auth.token,
        `${BASE_QUERY} ${FIRST_RUN_WINDOW}`,
        options.limit ?? FIRST_RUN_LIMIT,
      );
      refs = first.messages;
    } else {
      try {
        const history = await listHistory(auth.token, cursorBefore);
        refs = history.messages.slice(0, options.limit ?? INCREMENTAL_LIMIT);
        nextCursor = history.historyId ?? profile.historyId;
      } catch (error) {
        // 404 no histórico significa que o cursor é velho demais para o Google.
        // Recomeçar por janela é a recuperação certa; a idempotência garante
        // que reprocessar o que já existe não duplica nada.
        if (error instanceof GmailError && error.status === 404) {
          const fallback = await listMessages(
            auth.token,
            `${BASE_QUERY} newer_than:14d`,
            options.limit ?? INCREMENTAL_LIMIT,
          );
          refs = fallback.messages;
        } else {
          throw error;
        }
      }
    }

    let created = 0;
    let duplicates = 0;
    let needsReview = 0;
    let irrelevant = 0;

    for (const ref of refs) {
      const parsed = parseMessage(await getMessage(auth.token, ref.id));

      const normalized: NormalizedMessage = {
        provider: 'gmail',
        externalThreadId: parsed.threadId,
        externalMessageId: parsed.id,
        direction: self.includes(parsed.from.address) ? 'outbound' : 'inbound',
        sentAt: parsed.sentAt,
        fromAddress: parsed.from.address,
        fromName: parsed.from.name,
        toAddresses: parsed.to,
        subject: parsed.subject,
        bodyText: parsed.bodyText,
        snippet: parsed.snippet,
        selfAddresses: self,
        connectionId: auth.connectionId,
        rawRef: `gmail:${parsed.id}`,
      };

      const outcome = await ingestMessage(db, normalized, flags);
      if (outcome.status === 'created') created++;
      else if (outcome.status === 'duplicate') duplicates++;
      else if (outcome.status === 'needs_review') needsReview++;
      else if (outcome.status === 'irrelevant') irrelevant++;
    }

    // Só agora. Tudo o que veio foi durablemente escrito.
    await updateCursor(auth.connectionId, nextCursor);

    return finish({
      mailbox: mailbox.account,
      status: 'success',
      processed: refs.length,
      created,
      duplicates,
      needsReview,
      irrelevant,
      cursorBefore,
      cursorAfter: nextCursor,
      detail: cursorBefore ? 'Sincronização incremental.' : 'Primeira sincronização, por janela.',
    });
  } catch (error) {
    const code = error instanceof GmailError ? error.code : 'sync_failed';
    await markError(auth.connectionId, code);
    return finish({
      ...blank,
      status: 'error',
      cursorBefore,
      detail: error instanceof Error ? error.message : 'Falha desconhecida na sincronização.',
    });
  }
}
