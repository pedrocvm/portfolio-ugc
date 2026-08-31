import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import * as registry from './prompts/registry.ts';
import { geminiSchemaFor } from './gemini-schema.ts';

/** O Gemini rejeita o pedido inteiro por causa de uma palavra que não conhece.
 *  Foi assim que sete pesquisas de uma corrida morreram com um 400: o Zod emite
 *  `propertyNames` para um `z.record`, e a tradução na altura era uma lista do
 *  que remover — cobria três palavras e não essa. */
const CONHECIDAS = new Set([
  'type', 'format', 'title', 'description', 'nullable', 'enum', 'items',
  'properties', 'required', 'anyOf', 'propertyOrdering',
  'minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern',
]);

const estranhas = (node: unknown, found: string[] = [], inProps = false): string[] => {
  if (Array.isArray(node)) {
    node.forEach((v) => estranhas(v, found));
    return found;
  }
  if (!node || typeof node !== 'object') return found;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!inProps && !CONHECIDAS.has(k)) found.push(k);
    estranhas(v, found, k === 'properties');
  }
  return found;
};

const prompts: [string, z.ZodType<unknown>][] = Object.entries(
  registry as Record<string, { schema?: unknown }>,
).flatMap(([nome, p]) => (p?.schema ? [[nome, p.schema as z.ZodType<unknown>]] : []));

test('há prompts no registo para verificar', () => {
  assert.ok(prompts.length >= 10, `só encontrei ${prompts.length}`);
});

test('nenhum schema do registo leva uma palavra que o Gemini rejeite', () => {
  for (const [nome, schema] of prompts) {
    const traduzido = geminiSchemaFor(schema);
    const sobras = estranhas(traduzido);
    assert.deepEqual(sobras, [], `${nome} envia ${[...new Set(sobras)].join(', ')}`);
  }
});

test('um nome de campo igual a uma palavra de schema sobrevive', () => {
  // `properties` guarda nomes escolhidos por nós; filtrá-los pela mesma lista
  // apagava silenciosamente um campo chamado `title` ou `pattern`.
  const schema = z.object({ title: z.string(), pattern: z.string(), enum: z.string() });
  const out = geminiSchemaFor(schema) as { properties: Record<string, unknown> };
  assert.deepEqual(Object.keys(out.properties).sort(), ['enum', 'pattern', 'title']);
});

test('o que o Gemini precisa continua lá', () => {
  const schema = z.object({
    nome: z.string().describe('quem é'),
    nota: z.number().min(0).max(100),
    tipo: z.enum(['a', 'b']),
    talvez: z.string().nullable(),
    lista: z.array(z.string()),
  });
  const out = geminiSchemaFor(schema) as Record<string, never>;
  const json = JSON.stringify(out);
  assert.match(json, /"OBJECT"/, 'os tipos têm de ir em maiúsculas');
  assert.match(json, /"quem é"/, 'as descrições guiam o modelo');
  assert.match(json, /"enum":\["a","b"\]/);
  assert.match(json, /"nullable":true/, 'nullable é como o Gemini diz opcional');
  assert.match(json, /"required":/);
});
