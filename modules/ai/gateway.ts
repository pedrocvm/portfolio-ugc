import 'server-only';

import { z } from 'zod';
import { aiSetup } from './provider';
import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';

/** O único lugar da aplicação que fala com um modelo.
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
  /** Só diz se há credencial. O segredo nunca sai da camada de fornecedor. */
  apiKey: string | null;
  missing?: string | null;
};

/** Modelos vêm do ambiente. Nenhum nome de modelo aparece dentro de um módulo
 *  de negócio — trocar de modelo não pode ser um pull request no domínio. */
export function aiConfig(): AiConfig {
  // O gateway já não sabe qual é o fornecedor: pergunta à camada que sabe.
  const setup = aiSetup();
  return {
    provider: setup.id,
    models: { fast: setup.models.fast, reasoning: setup.models.deep },
    apiKey: setup.provider ? 'configurado' : null,
    missing: setup.missing,
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
  /** Constrói a mensagem do usuário a partir de dados já validados. */
  render: (input: TInput) => string;
  maxTokens?: number;
};

/** Uma imagem para o modelo ler. Existe por causa do Instagram: as DMs não têm
 *  API utilizável, e o print é o fallback documentado. */
export type ImageInput = { mediaType: string; base64: string };

export type RunOptions = {
  /** Imagens a acompanhar o texto. O modelo lê-as no mesmo turno. */
  images?: readonly ImageInput[];
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
      message: `Falta ${cfg.missing ?? 'a credencial de IA'}. A camada está preparada mas sem chave.`,
      runId: null,
    };
  }

  const user = prompt.render(input);
  const imageFingerprint = (options.images ?? []).map((i) => `${i.mediaType}:${i.base64.length}`).join('|');
  const inputHash = await hashContent(
    `${prompt.task}:${prompt.version}:${user}:${imageFingerprint}`,
  );
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
    const setup = aiSetup();
    if (!setup.provider) throw new AiUnavailableError('not_configured', 'Sem credencial.');

    const controller = new AbortController();
    const budget = options.timeoutMs ?? DEFAULT_TIMEOUT;
    // Armado já, para uma chamada sem espaçamento não ficar sem cronómetro; o
    // espaçamento rearma-o quando a chamada sai mesmo, para a espera na fila
    // não consumir o orçamento do modelo.
    let timer = setTimeout(() => controller.abort(), budget);
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), budget);
    };

    let call;
    try {
      call = await setup.provider.structured({
        model,
        system: await withFocus(prompt.system),
        user,
        schema: prompt.schema as z.ZodType<unknown>,
        jsonSchema: toJsonSchema(prompt.schema as z.ZodType<unknown>),
        maxTokens: prompt.maxTokens ?? 2048,
        images: options.images ? [...options.images] : undefined,
        signal: controller.signal,
        resetTimeout,
      });
    } finally {
      clearTimeout(timer);
    }
    raw = call.raw;
    usage = call.usage;
  } catch (error) {
    const code = error instanceof AiUnavailableError ? error.code : 'provider_error';
    const message = error instanceof Error ? error.message : 'Falha desconhecida no fornecedor.';
    // A frase é para quem lê a tela; o registro leva também o erro do fornecedor,
    // que a tradução tinha apagado. Sete pesquisas falharam com «A IA falhou e
    // não disse porquê» gravado sete vezes, e a causa — um campo de schema que o
    // Gemini não conhece — só apareceu ao reproduzir a chamada à mão.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
    const logged = cause ? `${message} | ${cause}` : message;
    const runId = await record(db, prompt, model, cfg, inputHash, options, null, 'error', started, null, code, logged);
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

/** Enche o buraco dos nichos prioritários com o foco que ela configurou.
 *
 *  A lista estava escrita no prompt. Depois de os nichos passarem a ser dela, o
 *  prompt continuava a dizer que os prioritários eram SaaS e afins — e o modelo
 *  obedecia, marcando um hotel como risco por não ser tech numa altura em que
 *  hotéis já eram prioritários. Duas verdades sobre a mesma coisa, e a errada
 *  era a que chegava ao modelo. */
async function withFocus(system: string): Promise<string> {
  if (!system.includes('{{NICHOS}}')) return system;
  try {
    const { readFocus } = await import('@/modules/outreach/focus-service');
    const focus = await readFocus();
    const lista = focus.niches
      .map((n) => (n.note ? `${n.label} (${n.note})` : n.label))
      .join('; ');
    return system.replace('{{NICHOS}}', lista);
  } catch {
    // Sem foco legível, tira-se a linha em vez de deixar um buraco à vista.
    return system.replace('{{NICHOS}}', 'os que ela configurou no CarolOS');
  }
}
