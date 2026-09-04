import 'server-only';

import { z } from 'zod';
import { aiSetup, type ToolCall, type ToolReply, type Turn as ProviderTurn } from '@/modules/ai/provider';
import { supabaseServer } from '@/lib/supabase/server';
import { classifyDomain, memoryCandidate, needsConfirmetion, OFF_TOPIC_REPLY, shouldUseTools, windowTurns, type Gate, type Source } from './domain';
import { assistantConfig } from './config';
import { CORE_PROMPT, PROMPT_VERSION, situationPrompt } from './prompt';
import { byName, TOOLS, type ToolContext } from './tools';
import { resolveEntity } from './context';
import { loadForModel } from './attachments';
import { summariseThread } from './summary';

/** O laço: mensagem → porta de domínio → contexto → modelo → ferramentas →
 *  resposta. Escrito à mão de propósito. Um framework de agentes esconderia
 *  exatamente as três coisas que aqui interessam: quantas rondas correram, que
 *  ferramentas foram chamadas, e quanto custou. */

export type StreamEvent =
  | { type: 'thread'; id: string }
  | { type: 'status'; label: string }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; message: string };

const STATUS: Record<string, string> = {
  search_brands: 'Procurando marcas…',
  get_brand: 'A ler o dossier da marca…',
  get_brand_activity: 'A ver o histórico…',
  search_opportunities: 'A ver as oportunidades…',
  get_opportunity: 'A ler a oportunidade…',
  get_today_actions: 'A ver a fila de hoje…',
  get_followups: 'A ver os follow-ups…',
  search_emails: 'Procurando nos emails…',
  get_email_thread: 'A ler a conversa…',
  calculate_price: 'Calculando o preço…',
  get_pricing_policy: 'A ler a política de preço…',
  get_revenue_summary: 'Somando a receita…',
  search_portfolio: 'A ver o portfólio…',
  search_documents: 'Procurando documentos…',
  get_rights: 'Verificando direitos…',
  search_business_memory: 'Lembrando-me…',
  search_knowledge: 'Consultando as fontes…',
  create_memory_candidate: 'Salvando…',
  get_daily_outreach_batch: 'A ver as marcas de hoje…',
  get_outreach_candidate: 'A ler a pesquisa da marca…',
  update_outreach_draft: 'A reescrever o email…',
  approve_outreach: 'Aprovando…',
  start_prospecting: 'Começando a busca…',
  get_prospecting_focus: 'A ver o que procura sozinho…',
  set_prospecting_focus: 'Mudando o que procurar…',
  resolve_today_action: 'Tratando da fila…',
  capture_something: 'Salvando…',
  find_anything: 'Procurando em tudo…',
  prepare_outreach_send: 'Verificando o envio…',
  get_mentor_playbook: 'Lendo a mentoria…',
  get_content_balance: 'Vendo o que falta esta semana…',
  classify_content_intent: 'Vendo o que isso é…',
  get_three_hooks: 'Escrevendo os três ganchos…',
  deconstruct_reference: 'Destrinchando…',
  evaluate_reels_test: 'Vendo se serve para teste…',
  get_reels_test_lab: 'Abrindo os testes…',
  record_content_performance: 'Registando os números…',
  get_content_learnings: 'Vendo o que já aprendemos…',
  get_broll_bank: 'Procurando B-roll…',
  save_broll_take: 'Guardando o take…',
  get_social_proof: 'Vendo os feedbacks…',
  save_social_proof: 'Guardando o feedback…',
  check_duplicate_content: 'Comparando com o que já saiu…',
  create_content_variant: 'Escrevendo a variante…',
  create_directed_content: 'Escrevendo a peça…',
  discover_braga_places: 'Procurando lugares em Braga…',
};

const toolSpecs = () =>
  TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: z.toJSONSchema(t.input as z.ZodType, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
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
    .insert({ thread_id: input.threadId, model: `${aiSetup().id}:${cfg.models.chat}`, prompt_version: PROMPT_VERSION, gate, status: 'running' })
    .select('id')
    .maybeSingle();

  const setup = aiSetup();
  if (!setup.provider) {
    yield { type: 'error', message: `Falta ${setup.missing ?? 'a credencial de IA'}.` };
    return;
  }

  const ctx: ToolContext = { entity: input.entity };

  const conversation: ProviderTurn[] = recent.map((t) => ({ role: t.role, text: t.content }));
  conversation.push({ role: 'user', text: input.userMessage });

  // Arquivos que ela anexou. Imagem e PDF vão nativos; texto vai como texto.
  const files = await loadForModel(input.attachmentIds ?? []);
  const attachments = files.map((f) =>
    f.kind === 'image'
      ? ({ kind: 'image' as const, mediaType: f.mediaType, data: f.data })
      : f.kind === 'pdf'
        ? ({ kind: 'pdf' as const, data: f.data })
        : ({ kind: 'text' as const, fileName: f.fileName, data: f.data }),
  );

  const sources: Source[] = [];
  let answer = '';
  let rounds = 0;
  let usage = { input: 0, output: 0, cached: 0 };
  let priorCalls: ToolCall[] | undefined;
  let toolReplies: ToolReply[] | undefined;

  try {
    for (;;) {
      const calls: ToolCall[] = [];

      for await (const chunk of setup.provider.stream({
        model: cfg.models.chat,
        system: {
          stable: CORE_PROMPT,
          volatile: situationPrompt({
            now: new Date().toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'full' }),
            entity,
            memories: memories.data ?? [],
            summary: thread.data?.summary ?? '',
          }),
        },
        turns: conversation,
        // Os arquivos só vão na primeira volta: repeti-los a cada ronda de
        // ferramentas era pagar o mesmo PDF quatro vezes.
        attachments: rounds === 0 ? attachments : undefined,
        tools: rounds < cfg.maxToolRounds && shouldUseTools(gate) ? toolSpecs() : undefined,
        toolReplies,
        priorCalls,
        maxTokens: cfg.maxOutputTokens,
        webSearch: input.webResearch,
        signal: input.signal,
      })) {
        if (chunk.type === 'text') {
          answer += chunk.text;
          yield { type: 'delta', text: chunk.text };
        } else if (chunk.type === 'tool_calls') {
          calls.push(...chunk.calls);
        } else if (chunk.type === 'usage') {
          usage = {
            input: usage.input + chunk.input,
            output: usage.output + chunk.output,
            cached: usage.cached + chunk.cached,
          };
        }
      }

      if (calls.length === 0 || rounds >= cfg.maxToolRounds) break;

      rounds += 1;
      const replies: ToolReply[] = [];

      for (const call of calls) {
        yield { type: 'status', label: STATUS[call.name] ?? 'Consultando…' };
        const t0 = Date.now();
        const tool = byName.get(call.name);

        if (!tool) {
          replies.push({ id: call.id, name: call.name, output: 'Ferramenta desconhecida.', isError: true });
          continue;
        }

        // Regra 3 do CarolOS, verificada no lugar onde as ferramentas correm e
        // não só na lista onde são registadas. Nenhuma ferramenta de alto risco
        // está registada — isto existe para o dia em que alguém registar uma
        // sem reparar. O modelo recebe a recusa como resultado e explica-a; não
        // ganha forma de contornar.
        if (tool.risk === 'high' || needsConfirmetion(tool.name)) {
          replies.push({
            id: call.id,
            name: call.name,
            output: JSON.stringify({
              refused: true,
              reason:
                'Esta ação sai para fora ou não se desfaz, por isso não corre por aqui. Prepara o que for preciso, mostra-lhe, e diz-lhe onde é o botão.',
            }),
          });
          if (run) {
            await db.from('assistant_tool_call').insert({
              run_id: run.id, tool: call.name, arguments: {},
              status: 'error', duration_ms: 0, error: 'recusada: acao de alto risco',
            });
          }
          continue;
        }

        try {
          const args = tool.input.parse(call.input ?? {});
          const out = await tool.run(args as never, ctx);
          sources.push(...out.sources);
          replies.push({
            id: call.id,
            name: call.name,
            // JSON, não prosa: assim o modelo lê isto como dado e não como
            // instrução, e é a mesma barreira para o que vem de emails.
            output: JSON.stringify(out.data).slice(0, 24000),
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
          replies.push({ id: call.id, name: call.name, output: `Falhou: ${message}`, isError: true });
          if (run) {
            await db.from('assistant_tool_call').insert({
              run_id: run.id, tool: call.name, arguments: {},
              status: 'error', duration_ms: Date.now() - t0, error: message.slice(0, 300),
            });
          }
        }
      }

      priorCalls = calls;
      toolReplies = replies;
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

    // A conversa cresceu: salva-se tudo, mas o que vai para o modelo passa a
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
          status: candidate.needsConfirmetion ? 'proposed' : 'active',
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
