import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, type FunctionDeclaration, type Part } from '@google/genai';
import type { z } from 'zod';

/** A camada entre o CarolOS e quem responde.
 *
 *  Existe porque trocar de fornecedor não pode ser reescrever o orquestrador,
 *  o gateway e a descoberta. O que o resto do código conhece é isto; qual
 *  modelo está por baixo é configuração.
 *
 *  Duas implementações, e a escolha é do ambiente. */

import { humanizeErrors } from './failure';
import { paced } from './pace';

export type ProviderId = 'gemini' | 'anthropic';

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema. Cada fornecedor traduz para o seu formato. */
  parameters: Record<string, unknown>;
};

export type Attachment =
  | { kind: 'image'; mediaType: string; data: string }
  | { kind: 'pdf'; data: string }
  | { kind: 'text'; fileName: string; data: string };

export type Turn = { role: 'user' | 'assistant'; text: string };

export type ToolCall = { id: string; name: string; input: unknown };

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; input: number; output: number; cached: number };

export type ToolReply = { id: string; name: string; output: string; isError?: boolean };

export type Provider = {
  id: ProviderId;
  /** Uma resposta estruturada, validada contra o schema. Sem ferramentas. */
  structured<T>(input: {
    model: string;
    system: string;
    user: string;
    schema: z.ZodType<T>;
    jsonSchema: Record<string, unknown>;
    maxTokens: number;
    images?: { mediaType: string; base64: string }[];
    signal?: AbortSignal;
  }): Promise<{ raw: unknown; usage: { input: number; output: number; cached: number } }>;

  /** Texto simples, para resumos e coisas curtas. */
  text(input: {
    model: string;
    system: string;
    user: string;
    maxTokens: number;
  }): Promise<string>;

  /** Conversa com ferramentas e streaming. O laço vive no orquestrador; isto
   *  só entrega os pedaços à medida que chegam. */
  stream(input: {
    model: string;
    system: { stable: string; volatile: string };
    turns: Turn[];
    attachments?: Attachment[];
    tools?: ToolSpec[];
    /** Respostas às ferramentas da volta anterior. */
    toolReplies?: ToolReply[];
    /** Chamadas que o modelo fez na volta anterior, para reconstruir o fio. */
    priorCalls?: ToolCall[];
    maxTokens: number;
    webSearch?: boolean;
    signal?: AbortSignal;
  }): AsyncGenerator<StreamChunk>;

  /** Pesquisa na web com o mecanismo nativo do fornecedor. */
  search(input: { model: string; system: string; user: string; maxTokens: number }): Promise<string>;
};

/* ── Gemini ──────────────────────────────────────────────────────────────── */

/** O Gemini recusa `additionalProperties`, `$schema` e `const`, e quer os
 *  tipos em maiúsculas. O Zod produz JSON Schema padrão; isto traduz. */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== 'object') return node;

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (key === 'additionalProperties' || key === '$schema' || key === 'default') continue;
    if (key === 'type' && typeof value === 'string') {
      out.type = value.toUpperCase();
      continue;
    }
    // `type: ['string','null']` vira nullable, que é como o Gemini o diz.
    if (key === 'type' && Array.isArray(value)) {
      const real = value.find((v) => v !== 'null');
      out.type = String(real ?? 'string').toUpperCase();
      if (value.includes('null')) out.nullable = true;
      continue;
    }
    if (key === 'anyOf' || key === 'oneOf') {
      const list = (value as unknown[]).filter(
        (v) => !(v && typeof v === 'object' && (v as Record<string, unknown>).type === 'null'),
      );
      if (list.length === 1) {
        Object.assign(out, toGeminiSchema(list[0]) as Record<string, unknown>, { nullable: true });
        continue;
      }
      out.anyOf = list.map(toGeminiSchema);
      continue;
    }
    out[key] = toGeminiSchema(value);
  }
  return out;
}

const geminiParts = (attachments: Attachment[] = []): Part[] =>
  attachments.map((a) =>
    a.kind === 'text'
      ? ({ text: `Arquivo anexado «${a.fileName}»:\n\n${a.data}` } as Part)
      : ({
          inlineData: { mimeType: a.kind === 'pdf' ? 'application/pdf' : a.mediaType, data: a.data },
        } as Part),
  );

function gemini(apiKey: string): Provider {
  const ai = new GoogleGenAI({ apiKey });

  return {
    id: 'gemini',

    async structured({ model, system, user, jsonSchema, maxTokens, images }) {
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              ...(images ?? []).map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.base64 } }) as Part),
              { text: user } as Part,
            ],
          },
        ],
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(jsonSchema) as never,
        },
      });

      const text = res.text ?? '';
      if (!text.trim()) throw new Error('empty_response: o modelo não devolveu nada.');

      return {
        raw: JSON.parse(text),
        usage: {
          input: res.usageMetadata?.promptTokenCount ?? 0,
          output: res.usageMetadata?.candidatesTokenCount ?? 0,
          cached: res.usageMetadata?.cachedContentTokenCount ?? 0,
        },
      };
    },

    async text({ model, system, user, maxTokens }) {
      const res = await ai.models.generateContent({
        model,
        contents: user,
        config: { systemInstruction: system, maxOutputTokens: maxTokens },
      });
      return res.text ?? '';
    },

    async search({ model, system, user, maxTokens }) {
      const res = await ai.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
          // O equivalente nativo: o modelo procura no Google e cita.
          tools: [{ googleSearch: {} }],
        },
      });
      return res.text ?? '';
    },

    async *stream({ model, system, turns, attachments, tools, toolReplies, priorCalls, maxTokens, webSearch, signal }) {
      const contents = turns.map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.text } as Part],
      }));

      // Reconstrói a volta anterior: o que o modelo pediu e o que as
      // ferramentas responderam.
      if (priorCalls?.length) {
        contents.push({
          role: 'model',
          parts: priorCalls.map((c) => ({ functionCall: { name: c.name, args: c.input as object } }) as Part),
        });
      }
      if (toolReplies?.length) {
        contents.push({
          role: 'user',
          parts: toolReplies.map(
            (r) => ({ functionResponse: { name: r.name, response: { result: r.output } } }) as Part,
          ),
        });
      }
      if (attachments?.length) {
        contents[contents.length - 1]?.parts.unshift(...geminiParts(attachments));
      }

      const declarations: FunctionDeclaration[] = (tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.parameters) as never,
      }));

      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          // O bloco estável e o volátil juntam-se: o Gemini não distingue, e a
          // cache dele é explícita e não vale a pena para este volume.
          systemInstruction: `${system.stable}\n\n${system.volatile}`,
          maxOutputTokens: maxTokens,
          abortSignal: signal,
          ...(declarations.length || webSearch
            ? {
                tools: [
                  ...(declarations.length ? [{ functionDeclarations: declarations }] : []),
                  ...(webSearch ? [{ googleSearch: {} }] : []),
                ],
              }
            : {}),
        },
      });

      const calls: ToolCall[] = [];
      let usage = { input: 0, output: 0, cached: 0 };

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield { type: 'text', text };

        for (const call of chunk.functionCalls ?? []) {
          calls.push({
            id: call.id ?? `${call.name}-${calls.length}`,
            name: call.name ?? '',
            input: call.args ?? {},
          });
        }
        if (chunk.usageMetadata) {
          usage = {
            input: chunk.usageMetadata.promptTokenCount ?? usage.input,
            output: chunk.usageMetadata.candidatesTokenCount ?? usage.output,
            cached: chunk.usageMetadata.cachedContentTokenCount ?? usage.cached,
          };
        }
      }

      yield { type: 'usage', ...usage };
      if (calls.length) yield { type: 'tool_calls', calls };
    },
  };
}

/* ── Anthropic ───────────────────────────────────────────────────────────── */

function anthropic(apiKey: string): Provider {
  const client = new Anthropic({ apiKey });

  return {
    id: 'anthropic',

    async structured({ model, system, user, jsonSchema, maxTokens, images, signal }) {
      const res = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages: [
            {
              role: 'user',
              content: [
                ...(images ?? []).map(
                  (i) =>
                    ({
                      type: 'image',
                      source: { type: 'base64', media_type: i.mediaType as 'image/png', data: i.base64 },
                    }) as Anthropic.ContentBlockParam,
                ),
                { type: 'text', text: user },
              ],
            },
          ],
          tools: [{ name: 'resposta', description: 'A resposta estruturada.', input_schema: jsonSchema as never }],
          tool_choice: { type: 'tool', name: 'resposta' },
        },
        { signal },
      );

      const call = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
      if (!call) throw new Error('empty_response: o modelo não usou a ferramenta.');

      return {
        raw: call.input,
        usage: {
          input: res.usage?.input_tokens ?? 0,
          output: res.usage?.output_tokens ?? 0,
          cached: res.usage?.cache_read_input_tokens ?? 0,
        },
      };
    },

    async text({ model, system, user, maxTokens }) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      return res.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    },

    async search({ model, system, user, maxTokens }) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as unknown as Anthropic.ToolUnion],
      });
      return res.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    },

    async *stream({ model, system, turns, attachments, tools, toolReplies, priorCalls, maxTokens, webSearch, signal }) {
      const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.text }));

      const last: Anthropic.ContentBlockParam[] = [];
      for (const a of attachments ?? []) {
        if (a.kind === 'image') {
          last.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType as 'image/png', data: a.data } });
        } else if (a.kind === 'pdf') {
          last.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
        } else {
          last.push({ type: 'text', text: `Arquivo anexado «${a.fileName}»:\n\n${a.data}` });
        }
      }
      if (last.length && messages.length) {
        const tail = messages[messages.length - 1];
        messages[messages.length - 1] = {
          role: tail.role,
          content: [...last, { type: 'text', text: String(tail.content) }],
        };
      }

      if (priorCalls?.length) {
        messages.push({
          role: 'assistant',
          content: priorCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input }) as Anthropic.ContentBlockParam),
        });
      }
      if (toolReplies?.length) {
        messages.push({
          role: 'user',
          content: toolReplies.map(
            (r) => ({ type: 'tool_result', tool_use_id: r.id, is_error: r.isError, content: r.output }) as Anthropic.ContentBlockParam,
          ),
        });
      }

      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          system: [
            { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: system.volatile },
          ],
          messages,
          ...(tools?.length || webSearch
            ? {
                tools: [
                  ...(tools ?? []).map((t) => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.parameters as never,
                  })),
                  ...(webSearch
                    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as unknown as Anthropic.ToolUnion]
                    : []),
                ],
              }
            : {}),
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      yield {
        type: 'usage',
        input: final.usage?.input_tokens ?? 0,
        output: final.usage?.output_tokens ?? 0,
        cached: final.usage?.cache_read_input_tokens ?? 0,
      };

      const calls = final.content
        .filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
        .map((c) => ({ id: c.id, name: c.name, input: c.input }));
      if (calls.length) yield { type: 'tool_calls', calls };
    },
  };
}

/* ── Escolha ─────────────────────────────────────────────────────────────── */

export type AiSetup = {
  provider: Provider | null;
  id: ProviderId;
  models: { fast: string; chat: string; deep: string };
  /** Porque é que não há fornecedor, quando não há. */
  missing: string | null;
};

export function aiSetup(): AiSetup {
  const id = (process.env.AI_PROVIDER ?? 'gemini') as ProviderId;

  if (id === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    const chat = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-sonnet-5';
    return {
      provider: key ? humanizeErrors(paced(anthropic(key))) : null,
      id,
      models: {
        fast: process.env.ANTHROPIC_FAST_MODEL ?? 'claude-haiku-4-5-20251001',
        chat,
        deep: process.env.ANTHROPIC_DEEP_MODEL ?? chat,
      },
      missing: key ? null : 'ANTHROPIC_API_KEY',
    };
  }

  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const chat = process.env.GEMINI_CHAT_MODEL ?? 'gemini-flash-lite-latest';
  return {
    provider: key ? humanizeErrors(paced(gemini(key))) : null,
    id: 'gemini',
    models: {
      fast: process.env.GEMINI_FAST_MODEL ?? chat,
      chat,
      deep: process.env.GEMINI_DEEP_MODEL ?? chat,
    },
    missing: key ? null : 'GEMINI_API_KEY',
  };
}

export const aiReady = () => aiSetup().provider !== null;
