type Any = Record<string, unknown> | unknown[];

export function getIn(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o == null ? o : (o as Any)[k as never]), obj);
}

/** Substitui um valor devolvendo cópias só do caminho tocado. */
export function setIn<T>(obj: T, path: string, value: unknown): T {
  const [key, ...rest] = path.split('.');
  const src = obj as unknown as Record<string, unknown>;
  const copy: Any = Array.isArray(obj)
    ? [...(obj as unknown[])]
    : { ...src };
  (copy as Record<string, unknown>)[key] = rest.length
    ? setIn(src[key], rest.join('.'), value)
    : value;
  return copy as unknown as T;
}

export const join = (base: string, path: string) =>
  base ? `${base}.${path}` : path;
