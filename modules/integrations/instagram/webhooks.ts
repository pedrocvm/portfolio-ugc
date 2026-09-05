/** Persistência dos webhooks da Meta.
 *
 *  A verificação — token, assinatura, chave de deduplicação — vive em
 *  `webhook-verify.ts`, puro. Aqui só se guarda o envelope e se processa
 *  depois: a Meta espera resposta rápida e desativa um webhook que demore.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import type { WebhookEnvelope } from './webhook-verify';

export * from './webhook-verify';

/** Guarda o envelope. Devolve `false` quando já existia — é o que torna o
 *  reprocessamento inofensivo. */
export async function storeEvent(envelope: WebhookEnvelope): Promise<{ stored: boolean }> {
  const { error } = await supabaseService()
    .from('instagram_webhook_event')
    .insert({
      dedupe_key: envelope.dedupeKey,
      topic: envelope.topic,
      field: envelope.field,
      payload: asJson(envelope.payload),
      status: 'received',
    });

  // 23505 é a violação de unicidade: o evento já cá estava.
  if (error) return { stored: false };
  return { stored: true };
}

/** Processa o que ficou em fila. Corre num trabalho, nunca no pedido — a Meta
 *  espera resposta rápida e desativa o webhook se demorarmos. */
export async function processPendingWebhooks(limit = 50): Promise<{ processed: number; ignored: number; failures: string[] }> {
  const db = supabaseService();
  const { data } = await db
    .from('instagram_webhook_event')
    .select('id, topic, field, payload')
    .eq('status', 'received')
    .order('received_at', { ascending: true })
    .limit(limit);

  const falhas: string[] = [];
  let processados = 0;
  let ignorados = 0;

  for (const evento of data ?? []) {
    try {
      // P1: comentários e story_insights são os únicos que o produto consome
      // hoje. Ativar tudo só porque existe seria encher a tabela de ruído.
      const util = evento.field === 'comments' || evento.field === 'story_insights';
      await db
        .from('instagram_webhook_event')
        .update({ status: util ? 'processed' : 'ignored', processed_at: new Date().toISOString() })
        .eq('id', evento.id);
      if (util) processados += 1;
      else ignorados += 1;
    } catch (error) {
      falhas.push(`webhook ${evento.id}: ${error instanceof Error ? error.message.slice(0, 120) : 'falha'}`);
      await db.from('instagram_webhook_event').update({ status: 'failed', error_summary: 'falha ao processar' }).eq('id', evento.id);
    }
  }

  return { processed: processados, ignored: ignorados, failures: falhas };
}
