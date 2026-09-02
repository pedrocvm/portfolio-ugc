/** Só as chaves conhecidas do modelo sobrevivem: um rascunho gravado por uma
 *  versão antiga continua abrindo, e campos novos entram com o valor de origem. */
export function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base;
    const template = base[0];
    // Sem um primeiro elemento não há forma conhecida para validar contra. A
    // lista entra como veio: é JSON já lido e só a editora consegue escrever.
    if (template === undefined) return over as T;
    return over.map((v) => merge(template, v)) as T;
  }
  if (base === null || typeof base !== 'object') {
    return typeof over === typeof base ? (over as T) : base;
  }
  if (typeof over !== 'object' || Array.isArray(over)) return base;
  const src = over as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base as Record<string, unknown>)) {
    out[k] = merge(v, src[k]);
  }
  return out as T;
}
