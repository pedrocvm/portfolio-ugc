import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { aiSetup } from '@/modules/ai/provider';
import { assistantConfig } from './config';
import { windowTurns } from './domain';

/** Resumo da conversa, para caber no contexto.
 *
 *  Não substitui nada: as mensagens ficam todas salvas e a Carol continua a
 *  vê-las. O resumo existe só para o modelo — mandar trinta turnos a cada
 *  pergunta é pagar o princípio da conversa para sempre.
 *
 *  Corre no modelo rápido. Resumir é uma tarefa barata e não vale o preço de um
 *  modelo de raciocínio. */
export async function summariseThread(threadId: string): Promise<{ updated: boolean }> {
  const cfg = assistantConfig();
  if (!cfg.apiKey) return { updated: false };

  const db = await supabaseServer();
  const { data: rows } = await db
    .from('assistant_message')
    .select('id, role, content')
    .eq('thread_id', threadId)
    .neq('role', 'tool')
    .order('created_at', { ascending: true });

  const turns = (rows ?? []).map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const { needsSummary, summariseThrough } = windowTurns(turns);
  if (!needsSummary || !summariseThrough) return { updated: false };

  const { data: thread } = await db
    .from('assistant_thread')
    .select('summary_through_id, summary_version')
    .eq('id', threadId)
    .maybeSingle();

  // Já resumido até aqui: não se paga duas vezes pelo mesmo texto.
  if (thread?.summary_through_id === summariseThrough) return { updated: false };

  const cut = turns.findIndex((t) => t.id === summariseThrough);
  const older = turns.slice(0, cut + 1);
  if (older.length === 0) return { updated: false };

  const setup = aiSetup();
  if (!setup.provider) return { updated: false };

  const text = (
    await setup.provider.text({
      model: cfg.models.fast,
      maxTokens: 600,
      system:
        'Resumes uma conversa de trabalho entre a Carol e o assistente do negócio dela. ' +
        'Escreve em português europeu, em tópicos curtos. Salva: decisões tomadas, ' +
        'valores e datas mencionados, marcas e oportunidades faladas, e o que ficou por ' +
        'fazer. Não inventes nada que não esteja no texto. Não repitas cortesias.',
      user: older
        .map((t) => `${t.role === 'user' ? 'Carol' : 'Assistente'}: ${t.content}`)
        .join('\n\n')
        .slice(0, 30000),
    })
  ).trim();

  if (!text) return { updated: false };

  await db
    .from('assistant_thread')
    .update({
      summary: text,
      summary_through_id: summariseThrough,
      summary_version: (thread?.summary_version ?? 0) + 1,
    })
    .eq('id', threadId);

  return { updated: true };
}
