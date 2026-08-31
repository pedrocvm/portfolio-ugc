/** Traduz um JSON Schema para o dialecto do Gemini.
 *
 *  Puro e fora do `server-only` de propósito: é a parte que se pode verificar
 *  sem falar com a rede, e é onde um engano custa a corrida inteira — o Gemini
 *  rejeita o pedido todo por causa de uma palavra que não conhece.
 */
import { z } from 'zod';

/** Os campos que o Gemini conhece num schema. Tudo o resto é deitado fora.
 *
 *  Antes isto era uma lista do que remover, e cada palavra nova que o Zod
 *  emitisse partia tudo com um 400 — foi `propertyNames`, de um `z.record`, que
 *  matou as sete pesquisas de uma corrida. Guardar o que é conhecido erra para
 *  o lado seguro: um campo a menos degrada o schema, um campo a mais rejeita-o. */
const GEMINI_SCHEMA_KEYS = new Set([
  'type', 'format', 'title', 'description', 'nullable', 'enum', 'items',
  'properties', 'required', 'anyOf', 'propertyOrdering',
  'minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern',
]);

export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== 'object') return node;

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue;

    // As chaves de `properties` são nomes de campos, não palavras de schema:
    // filtrá-las pela lista apagaria um campo chamado `title` ou `pattern`.
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, sub]) => [name, toGeminiSchema(sub)]),
      );
      continue;
    }
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
    if (key === 'anyOf') {
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

/** O schema de um prompt, como o Gemini o recebe. */
export function geminiSchemaFor(schema: z.ZodType<unknown>): unknown {
  return toGeminiSchema(z.toJSONSchema(schema, { io: 'output' }));
}
