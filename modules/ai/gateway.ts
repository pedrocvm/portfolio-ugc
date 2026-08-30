import 'server-only';

import { z } from 'zod';
import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';

/** O único sítio da aplicação que fala com um modelo.
 *
 *  Existe para que nenhum módulo comercial importe um SDK, para que toda a
 *  saída passe por um schema antes de tocar no domínio, e para que cada
 *  chamada deixe uma linha em `ai_run` com prompt, versão, evidência e
 *  confiança. Uma recomendação que não consegue dizer de onde veio não entra.
 *
 *  Sem SDK: a Messages API da Anthropic é JSON sobre HTTP e o adaptador cabe
 *  em cem linhas. Uma dependência de 40 MB para fazer um POST não se justifica,
 *  e a abstração que interessa é esta, não a do fornecedor. */

export type ModelTier = 'fast' | 'reasoning';

export type AiConfig = {
  provider: string;
  models: Record<ModelTier, string>;
  apiKey: string | null;
};

/** Modelos vêm do ambiente. Nenhum nome de modelo aparece dentro de um módulo
 *  de negócio — trocar de modelo não pode ser um pull request no domínio. */
export function aiConfig(): AiConfig {
  return {
    provider: process.env.AI_PROVIDER ?? 'anthropic',
    models: {
      fast: process.env.AI_MODEL_FAST ?? 'claude-haiku-4-5-20251001',
      reasoning: process.env.AI_MODEL_REASONING ?? 'claude-sonnet-5',
    },
    apiKey: process.env.ANTHROPIC_API_KEY ?? null,
  };
}

export const aiConfigured = () => Boolean(aiConfig().apiKey);

export class AiUnavailableError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export type PromptContext = Record<string, unknown>;

export type Prompt<TInput, TOutput> = {
  /** Identificador estável da operação. Vai para `ai_run.task_type`. */
  task: string;
  /** Versão imutável. Mudar o texto obriga a subir isto: uma decisão antiga
   *  tem de continuar a saber que prompt a produziu. */
  version: string;
  tier: ModelTier;
  schema: z.ZodType<TOutput>;
  system: string;
  /** Constrói a mensagem do utilizador a partir de dados já validados. */
  render: (input: TInput) => string;
  maxTokens?: number;
};

export type RunOptions = {
  entityType?: string;
  entityId?: string | null;
  policyVersions?: Record<string, string>;
  evidenceRefs?: unknown[];
  /** Quando verdadeiro, uma corrida anterior com o mesmo input é reaproveitada. */
  cache?: boolean;
  timeoutMs?: number;
};

export type RunResult<T> =
  | { ok: true; output: T; runId: string | null; cached: boolean; latencyMs: number }
  | { ok: false; code: string; message: string; runId: string | null };

const DEFAULT_TIMEOUT = 45_000;

type AnthropicResponse = {
  content?: { type: string; text?: string; input?: unknown; name?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

/** Saída estruturada por tool-use: o modelo é obrigado a chamar uma ferramenta
 *  cujo input é o schema. Muito mais fiável do que pedir JSON em prosa e depois
 *  tentar apanhá-lo com uma expressão regular. */
async function callAnthropic(
  cfg: AiConfig,
  model: string,
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
  maxTokens: number,
  timeoutMs: number,
): Promise<{ raw: unknown; usage: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [
          {
            name: 'emit',
            description: 'Devolve o resultado estruturado. É a única forma de responder.',
            input_schema: jsonSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'emit' },
      }),
    });

    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as AnthropicResponse | null;
      throw new AiUnavailableError(
        `http_${res.status}`,
        detail?.error?.message ?? `O fornecedor respondeu ${res.status}.`,
      );
    }

    const body = (await res.json()) as AnthropicResponse;
    const tool = body.content?.find((c) => c.type === 'tool_use');
    if (!tool || tool.input === undefined) {
      throw new AiUnavailableError('no_structured_output', 'O modelo não devolveu saída estruturada.');
    }
    return { raw: tool.input, usage: body.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/** Zod v4 gera JSON Schema nativamente; sem isto seria preciso manter dois
 *  desenhos do mesmo contrato e vê-los divergir. */
function toJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as Record<string, unknown>;
  // A Anthropic exige um objecto no topo.
  return json.type === 'object' ? json : { type: 'object', properties: {}, additionalProperties: true };
}

export async function runPrompt<TInput, TOutput>(
  prompt: Prompt<TInput, TOutput>,
  input: TInput,
  options: RunOptions = {},
): Promise<RunResult<TOutput>> {
  const cfg = aiConfig();
  const started = Date.now();

  if (!cfg.apiKey) {
    return {
      ok: false,
      code: 'not_configured',
      message: 'Falta ANTHROPIC_API_KEY. A camada de IA está preparada mas sem credencial.',
      runId: null,
    };
  }

  const user = prompt.render(input);
  const inputHash = await hashContent(`${prompt.task}:${prompt.version}:${user}`);
  const db = supabaseService();

  if (options.cache) {
    const { data: hit } = await db
      .from('ai_run')
      .select('id, structured_output')
      .eq('task_type', prompt.task)
      .eq('input_hash', inputHash)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (hit?.structured_output) {
      const parsed = prompt.schema.safeParse(hit.structured_output);
      if (parsed.success) {
        return { ok: true, output: parsed.data, runId: hit.id, cached: true, latencyMs: 0 };
      }
    }
  }

  const model = cfg.models[prompt.tier];
  let raw: unknown;
  let usage: unknown = null;

  try {
    const call = await callAnthropic(
      cfg,
      model,
      prompt.system,
      user,
      toJsonSchema(prompt.schema as z.ZodType<unknown>),
      prompt.maxTokens ?? 2048,
      options.timeoutMs ?? DEFAULT_TIMEOUT,
    );
    raw = call.raw;
    usage = call.usage;
  } catch (error) {
    const code = error instanceof AiUnavailableError ? error.code : 'provider_error';
    const message = error instanceof Error ? error.message : 'Falha desconhecida no fornecedor.';
    const runId = await record(db, prompt, model, cfg, inputHash, options, null, 'error', started, null, code, message);
    return { ok: false, code, message, runId };
  }

  const parsed = prompt.schema.safeParse(raw);
  if (!parsed.success) {
    const message = `A saída não cumpre o schema: ${parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || 'raiz'} ${i.message}`)
      .join('; ')}`;
    const runId = await record(
      db, prompt, model, cfg, inputHash, options, raw, 'error', started, null, 'schema_mismatch', message,
    );
    return { ok: false, code: 'schema_mismatch', message, runId };
  }

  const confidence =
    typeof (parsed.data as { confidence?: unknown }).confidence === 'number'
      ? ((parsed.data as { confidence: number }).confidence)
      : null;

  const runId = await record(
    db, prompt, model, cfg, inputHash, options, parsed.data, 'success', started, confidence, null, null, usage,
  );

  return { ok: true, output: parsed.data, runId, cached: false, latencyMs: Date.now() - started };
}

type PromptMeta = Pick<Prompt<never, never>, 'task' | 'version' | 'tier'>;

async function record(
  db: ReturnType<typeof supabaseService>,
  prompt: PromptMeta,
  model: string,
  cfg: AiConfig,
  inputHash: string,
  options: RunOptions,
  output: unknown,
  status: 'success' | 'error' | 'review',
  started: number,
  confidence: number | null,
  errorCode: string | null,
  errorSummary: string | null,
  usage: unknown = null,
): Promise<string | null> {
  const { data } = await db
    .from('ai_run')
    .insert({
      task_type: prompt.task,
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      model_provider: cfg.provider,
      model_name: model,
      model_tier: prompt.tier,
      prompt_version: prompt.version,
      policy_versions: asJson(options.policyVersions ?? {}),
      input_hash: inputHash,
      structured_output: asJson(output ?? null),
      confidence,
      evidence_refs: asJson(options.evidenceRefs ?? []),
      status,
      latency_ms: Date.now() - started,
      usage_metadata: asJson(usage ?? null),
      error_code: errorCode,
      // Nunca o corpo da mensagem: o resumo do erro pode acabar num log.
      error_summary: errorSummary?.slice(0, 500) ?? null,
    })
    .select('id')
    .maybeSingle();

  return data?.id ?? null;
}
