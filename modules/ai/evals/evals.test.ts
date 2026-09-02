import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  BriefSchema, CaptureSchema, CommercialExtractionSchema, CreativeSchema, DossierSchema,
  NegotiationSchema, NextActionSchema, REPLY_TYPES, ReplyDraftSchema, ThreadClassificationSchema,
  UpsellSchema,
} from '../schemas.ts';
import { FIXTURES } from './fixtures.ts';
import * as registry from '../prompts/registry.ts';

/** O que se pode verificar sobre a camada de IA sem chamar um modelo.
 *
 *  Chamar o modelo em cada build seria caro, lento e instável — a variação
 *  natural dele transformaria o CI numa moeda ao ar. O que corre sempre é
 *  isto: os contratos, os prompts e a coerência do conjunto de avaliação.
 *  A avaliação com modelo real corre à parte, com `npm run eval:ai`. */

type PromptShape = {
  task: string;
  version: string;
  tier: 'fast' | 'reasoning';
  system: string;
  schema: z.ZodType<unknown>;
};

/** O registro exporta prompts com tipos de entrada diferentes; para inspeção
 *  interessa só a forma comum. */
const PROMPTS: PromptShape[] = (Object.values(registry) as unknown[]).filter(
  (v): v is PromptShape =>
    typeof v === 'object' && v !== null && 'task' in v && 'version' in v,
);

test('cada prompt tem tarefa, versão e nível de modelo', () => {
  assert.ok(PROMPTS.length >= 9, `esperava a bateria toda, encontrei ${PROMPTS.length}`);
  for (const p of PROMPTS) {
    assert.ok(p.task.length > 0, 'prompt sem identificador de tarefa');
    assert.match(p.version, /^v\d+$/, `${p.task}: versão tem de ser vN`);
    assert.ok(['fast', 'reasoning'].includes(p.tier), `${p.task}: nível inválido`);
  }
});

test('os identificadores de tarefa são únicos: cada corrida tem de saber de onde veio', () => {
  const tasks = PROMPTS.map((p) => p.task);
  assert.equal(new Set(tasks).size, tasks.length);
});

test('nenhum prompt trata skincare ou haircare como oportunidade', () => {
  for (const p of PROMPTS) {
    const system = p.system.toLowerCase();
    if (!system.includes('skincare')) continue;
    // Se menciona, tem de ser para os excluir.
    assert.match(
      system,
      /não são nichos|nunca os sugerenciar|fora da estratégia/,
      `${p.task}: menciona skincare sem o excluir`,
    );
  }
});

test('nenhum prompt carrega política de preço: os números vêm do motor', () => {
  // Um valor concreto dentro de um prompt seria uma tabela de preços sem
  // versão, sem teste e sem auditoria.
  const PRICE = /\b\d{2,4}\s?(€|eur)\b|\+\s?\d{2,3}\s?%/i;
  for (const p of PROMPTS) {
    assert.doesNotMatch(p.system, PRICE, `${p.task}: tem um valor escrito no prompt`);
  }
});

test('os prompts que escrevem para fora proíbem compromissos explicitamente', () => {
  for (const task of ['draft_reply', 'negotiation_analysis']) {
    const prompt = PROMPTS.find((p) => p.task === task)!;
    const system = prompt.system.toLowerCase();
    assert.match(system, /nunca|não pod/i, `${task}: sem proibições explícitas`);
    assert.match(system, /exclusividade|perpetuidade|whitelisting/i, `${task}: não nomeia os riscos`);
  }
});

test('todo o schema estruturado tem confiança', () => {
  const schemas = {
    ThreadClassificationSchema, CommercialExtractionSchema, NextActionSchema, ReplyDraftSchema,
    NegotiationSchema, BriefSchema, DossierSchema, CreativeSchema, CaptureSchema, UpsellSchema,
  };
  for (const [name, schema] of Object.entries(schemas)) {
    const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;
    assert.ok('confidence' in shape, `${name} não devolve confiança`);
  }
});

test('a extração rejeita um valor de dinheiro que não seja inteiro em cêntimos', () => {
  const base = {
    reply_types: ['rate_request'], brand_name: null, contact_name: null, contact_role: null,
    product_or_campaign: null, requested_actions: [], compensation_model: null,
    currency: null, barter_product: null, barter_value_cents: null,
    paid_usage_requested: false, usage_period: null, usage_platforms: [],
    raw_footage_requested: false, exclusivity_requested: false, whitelisting_requested: false,
    deadline: null, promised_reply_date: null, explicit_acceptance: false,
    explicit_rejection: false, deferral: false, rejection_reason: null,
    questions: [], uncertainties: [], evidence_spans: [], confidence: 0.9,
  };

  assert.equal(CommercialExtractionSchema.safeParse({ ...base, cash_amount_cents: 13000 }).success, true);
  assert.equal(CommercialExtractionSchema.safeParse({ ...base, cash_amount_cents: 130.5 }).success, false);
  assert.equal(CommercialExtractionSchema.safeParse({ ...base, cash_amount_cents: -100 }).success, false);
  assert.equal(CommercialExtractionSchema.safeParse({ ...base, cash_amount_cents: null }).success, true);
});

test('a confiança tem de estar entre zero e um', () => {
  const ok = { is_commercial: true, confidence: 0.5, category: 'reply', brand_candidate: null, reason_codes: [] };
  assert.equal(ThreadClassificationSchema.safeParse(ok).success, true);
  assert.equal(ThreadClassificationSchema.safeParse({ ...ok, confidence: 1.5 }).success, false);
  assert.equal(ThreadClassificationSchema.safeParse({ ...ok, confidence: -0.1 }).success, false);
});

test('a recomendação de negociação só aceita os cinco veredictos canónicos', () => {
  const shape = NegotiationSchema.shape.recommendation;
  const values = (shape as unknown as { options: string[] }).options;
  assert.deepEqual([...values].sort(), ['ACCEPT', 'ASK', 'DECLINE', 'NEGOTIATE', 'NURTURE']);
});

/* ── Coerência do conjunto de avaliação ─────────────────────────────────── */

test('cada caso de avaliação tem id único', () => {
  const ids = FIXTURES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('cada caso usa apenas tipos de resposta que existem no schema', () => {
  for (const f of FIXTURES) {
    for (const t of [...f.expect.replyTypes, ...(f.expect.forbiddenReplyTypes ?? [])]) {
      assert.ok(REPLY_TYPES.includes(t), `${f.id}: tipo desconhecido ${t}`);
    }
  }
});

test('cada caso diz o que o modelo não pode inventar', () => {
  for (const f of FIXTURES) {
    assert.ok(Array.isArray(f.expect.mustNotInvent), `${f.id}: sem lista de proibições`);
    assert.ok(f.message.trim().length > 20, `${f.id}: mensagem curta demais para avaliar`);
  }
});

test('o conjunto cobre os casos que o briefing exige', () => {
  const ids = FIXTURES.map((f) => f.id).join(' ');
  for (const required of [
    'rate_request', 'media_kit', 'barter', 'affiliate', 'promised_date',
    'rejection', 'revision', 'brief', 'perpetual',
  ]) {
    assert.match(ids, new RegExp(required), `falta um caso de ${required}`);
  }
});

test('há um caso de ruído: o classificador tem de conseguir dizer "não é trabalho"', () => {
  const noise = FIXTURES.find((f) => f.expect.acceptableActions.length === 0);
  assert.ok(noise, 'sem um caso negativo, nada impede o sistema de criar marcas a partir de spam');
  assert.ok(noise.expect.forbiddenReplyTypes?.length);
});

test('entusiasmo e aceitação estão ambos no conjunto, e são diferentes', () => {
  const enthusiasm = FIXTURES.find((f) => f.id === 'enthusiasm_not_acceptance')!;
  const acceptance = FIXTURES.find((f) => f.id === 'explicit_acceptance_with_price')!;
  assert.equal(enthusiasm.expect.explicitAcceptance, false);
  assert.equal(acceptance.expect.explicitAcceptance, true);
});

test('o caso de aceitação traz o valor exato, em cêntimos inteiros', () => {
  const f = FIXTURES.find((x) => x.id === 'explicit_acceptance_with_price')!;
  assert.equal(f.expect.cashAmountCents, 19500);
  assert.equal(Number.isInteger(f.expect.cashAmountCents), true);
});
