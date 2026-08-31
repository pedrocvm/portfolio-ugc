import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { classifyDomain, memoryCandidate, OFF_TOPIC_REPLY, shouldUseTools, windowTurns, type Gate, type Source } from './domain';
import { assistantConfig } from './config';
import { CORE_PROMPT, PROMPT_VERSION, situationPrompt } from './prompt';
import { byName, TOOLS, type ToolContext } from './tools';
import { resolveEntity } from './context';
import { loadForModel } from './attachments';
import { summariseThread } from './summary';

/** O laço: mensagem → porta de domínio → contexto → modelo → ferramentas →
 *  resposta. Escrito à mão de propósito. Um framework de agentes esconderia
 *  exactamente as três coisas que aqui interessam: quantas rondas correram, que
 *  ferramentas foram chamadas, e quanto custou. */

export type StreamEvent =
  | { type: 'thread'; id: string }
  | { type: 'status'; label: string }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; message: string };

const STATUS: Record<string, string> = {
  search_brands: 'A procurar marcas…',
  get_brand: 'A ler o dossier da marca…',
  get_brand_activity: 'A ver o histórico…',
  search_opportunities: 'A ver as oportunidades…',
  get_opportunity: 'A ler a oportunidade…',
  get_today_actions: 'A ver a fila de hoje…',
  get_followups: 'A ver os follow-ups…',
  search_emails: 'A procurar nos emails…',
  get_email_thread: 'A ler a conversa…',
  calculate_price: 'A calcular o preço…',
  get_pricing_policy: 'A ler a política de preço…',
  get_revenue_summary: 'A somar a receita…',
  search_portfolio: 'A ver o portfólio…',
  search_documents: 'A procurar documentos…',
  get_rights: 'A verificar direitos…',
  search_business_memory: 'A lembrar-me…',
  search_knowledge: 'A consultar as fontes…',
  create_memory_candidate: 'A guardar…',
};

const toolSchemas = () =>
  TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.input as z.ZodType, { io: 'input', unrepresentable: 'any' }) as Anthropic.Tool.InputSchema,
  }));

export async function* runAssistant(input: {
  threadId: string;
  userMessage: string;
  entity: { type: string; id: string | null } | null;
  attachmentIds?: string[];
  webResearch?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const cfg = assistantConfig();
  if (!cfg.apiKey) {
    yield { type: 'error', message: 'A Carol AI ainda não tem chave da Anthropic configurada.' };
    return;
  }

  const db = await supabaseServer();
  const started = Date.now();

  // ── Histórico e contexto ───────────────────────────────────────────────
  const { data: history } = await db
    .from('assistant_message')
    .select('id, role, content')
    .eq('thread_id', input.threadId)
    .neq('role', 'tool')
    .order('created_at', { ascending: true });

  const turns = (history ?? []).map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const gate: Gate = classifyDomain(input.userMessage, {
    hasEntity: Boolean(input.entity?.id),
    priorTurns: turns.length,
  });

  // ── Fora de tema: nem ferramentas, nem modelo caro ─────────────────────
  if (gate === 'off_topic') {
    await db.from('assistant_message').insert({ thread_id: input.threadId, role: 'user', content: input.userMessage });
    const { data: saved } = await db
      .from('assistant_message')
      .insert({ thread_id: input.threadId, role: 'assistant', content: OFF_TOPIC_REPLY, prompt_version: PROMPT_VERSION })
      .select('id')
      .maybeSingle();
    await db.from('assistant_run').insert({
      thread_id: input.threadId, model: '(nenhum)', prompt_version: PROMPT_VERSION,
      gate, status: 'success', tool_rounds: 0, latency_ms: Date.now() - started,
      finished_at: new Date().toISOString(),
    });
    yield { type: 'delta', text: OFF_TOPIC_REPLY };
    yield { type: 'done', messageId: saved?.id ?? null };
    return;
  }

  const { data: userRow } = await db
    .from('assistant_message')
    .insert({ thread_id: input.threadId, role: 'user', content: input.userMessage })
    .select('id')
    .maybeSingle();

  const [entity, memories, thread] = await Promise.all([
    resolveEntity(input.entity),
    db.from('business_memory').select('type, content').eq('status', 'active').order('effective_from', { ascending: false }).limit(20),
    db.from('assistant_thread').select('summary').eq('id', input.threadId).maybeSingle(),
  ]);

  const { recent } = windowTurns(turns);

  const { data: run } = await db
    .from('assistant_run')
    .insert({ thread_id: input.threadId, model: cfg.models.chat, prompt_version: PROMPT_VERSION, gate, status: 'running' })
    .select('id')
    .maybeSingle();

  const client = new Anthropic({ apiKey: cfg.apiKey });
  const ctx: ToolContext = { entity: input.entity };

  // Ficheiros entram no turno dela: imagem e PDF em base64, que é o que o
  // modelo lê nativamente. Fazer OCR à parte seria trabalho a dobrar e pior.
  const files = await loadForModel(input.attachmentIds ?? []);
  const turnContent: Anthropic.ContentBlockParam[] = [];
  for (const f of files) {
    if (f.kind === 'image') {
      turnContent.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType as 'image/png', data: f.data } });
    } else if (f.kind === 'pdf') {
      turnContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
    } else {
      // Texto vai como texto: mandar um CSV em base64 é pagar tokens por ruído.
      turnContent.push({ type: 'text', text: `Ficheiro anexado «${f.fileName}»:\n\n${f.data}` });
    }
  }
  turnContent.push({ type: 'text', text: input.userMessage });

  const messages: Anthropic.MessageParam[] = [
    ...recent.map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    { role: 'user', content: turnContent },
  ];

  const sources: Source[] = [];
  let answer = '';
  let rounds = 0;
  let usage = { input: 0, output: 0, cached: 0 };

  try {
    for (;;) {
      const stream = client.messages.stream(
        {
          model: cfg.models.chat,
          max_tokens: cfg.maxOutputTokens,
          system: [
            // O bloco estável primeiro, marcado para cache: é o mesmo em todos
            // os pedidos e não vale a pena pagá-lo de novo a cada mensagem.
            { type: 'text', text: CORE_PROMPT, cache_control: { type: 'ephemeral' } },
            {
              type: 'text',
              text: situationPrompt({
                now: new Date().toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'full' }),
                entity,
                memories: memories.data ?? [],
                summary: thread.data?.summary ?? '',
              }),
            },
          ],
          messages,
          tools:
            rounds < cfg.maxToolRounds && shouldUseTools(gate)
              ? [
                  ...toolSchemas(),
                  // Pesquisa do lado do fornecedor, atrás de bandeira. Só entra
                  // quando ela a liga: o Carol AI não é um chatbot da web.
                  ...(input.webResearch
                    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as unknown as Anthropic.ToolUnion]
                    : []),
                ]
              : undefined,
        },
        { signal: input.signal },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          answer += event.delta.text;
          yield { type: 'delta', text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      usage = {
        input: usage.input + (final.usage?.input_tokens ?? 0),
        output: usage.output + (final.usage?.output_tokens ?? 0),
        cached: usage.cached + (final.usage?.cache_read_input_tokens ?? 0),
      };

      const calls = final.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
      if (calls.length === 0 || rounds >= cfg.maxToolRounds) break;

      rounds += 1;
      messages.push({ role: 'assistant', content: final.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        yield { type: 'status', label: STATUS[call.name] ?? 'A consultar…' };
        const t0 = Date.now();
        const tool = byName.get(call.name);

        if (!tool) {
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Ferramenta desconhecida.' });
          continue;
        }

        try {
          const args = tool.input.parse(call.input ?? {});
          const out = await tool.run(args as never, ctx);
          sources.push(...out.sources);
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            // JSON, não prosa: assim o modelo lê isto como dado e não como
            // instrução, e é a mesma barreira para o que vem de emails.
            content: JSON.stringify(out.data).slice(0, 24000),
          });
          if (run) {
            await db.from('assistant_tool_call').insert({
              run_id: run.id, tool: call.name, arguments: args as never,
              status: 'ok', duration_ms: Date.now() - t0,
              result_summary: `${JSON.stringify(out.data).length} bytes, ${out.sources.length} fontes`,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'falhou';
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Falhou: ${message}` });
          if (run) {
            await db.from('assistant_tool_call').insert({
              run_id: run.id, tool: call.name, arguments: {},
              status: 'error', duration_ms: Date.now() - t0, error: message.slice(0, 300),
            });
          }
        }
      }

      messages.push({ role: 'user', content: results });
    }

    // Fontes sem repetições: o modelo cruza marca e emails e vê a mesma duas vezes.
    const unique = [...new Map(sources.map((s) => [`${s.type}:${s.id}`, s])).values()].slice(0, 12);
    if (unique.length) yield { type: 'sources', sources: unique };

    const { data: saved } = await db
      .from('assistant_message')
      .insert({
        thread_id: input.threadId, role: 'assistant', content: answer,
        sources: unique as never, model: cfg.models.chat, prompt_version: PROMPT_VERSION,
        input_tokens: usage.input, output_tokens: usage.output, cached_tokens: usage.cached,
      })
      .select('id')
      .maybeSingle();

    await db.from('assistant_thread').update({ last_message_at: new Date().toISOString() }).eq('id', input.threadId);

    if (run) {
      await db.from('assistant_run').update({
        message_id: saved?.id ?? null, status: 'success', tool_rounds: rounds,
        input_tokens: usage.input, output_tokens: usage.output, cached_tokens: usage.cached,
        latency_ms: Date.now() - started, finished_at: new Date().toISOString(),
      }).eq('id', run.id);
    }

    // A conversa cresceu: guarda-se tudo, mas o que vai para o modelo passa a
    // ser resumo + fim. Sem isto pagava-se o princípio da conversa para sempre.
    await summariseThread(input.threadId).catch(() => {});

    // Uma preferência declarada não pode morrer com a conversa.
    const candidate = memoryCandidate(input.userMessage);
    if (candidate) {
      const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
      if (me) {
        await db.from('business_memory').insert({
          app_user_id: me.id,
          type: candidate.type,
          content: candidate.content.slice(0, 600),
          source: 'conversation',
          source_message_id: userRow?.id ?? null,
          status: candidate.needsConfirmation ? 'proposed' : 'active',
        });
      }
    }

    yield { type: 'done', messageId: saved?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'A Carol AI falhou a meio.';
    if (run) {
      await db.from('assistant_run').update({
        status: 'error', error: message.slice(0, 400), tool_rounds: rounds,
        latency_ms: Date.now() - started, finished_at: new Date().toISOString(),
      }).eq('id', run.id);
    }
    yield { type: 'error', message };
  }
}
