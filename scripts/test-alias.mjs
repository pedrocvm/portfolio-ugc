/** O executor de testes do Node resolve módulos como o Node, não como o
 *  bundler: não lê os `paths` do tsconfig (`@/lib/time`) nem completa a
 *  extensão de um import relativo (`./niches`). O código de produção está
 *  escrito para o Next, e não vale a pena torcê-lo para os testes correrem.
 *
 *  Este gancho faz as duas coisas, e só isso: mapeia `@/` para a raiz e tenta
 *  `.ts`, `.tsx` e `/index.ts` quando o caminho não tem extensão. Especificadores
 *  externos (`zod`, `node:test`) passam intactos. */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = pathToFileURL(`${process.cwd()}/`).href;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;

/** `server-only` é um marcador que rebenta ao ser importado fora do React
 *  Server. Nos testes vale o mesmo que no servidor: nada. Sem isto, nenhum
 *  módulo marcado server-only se consegue testar. */
const SERVER_ONLY = new URL('node_modules/server-only/empty.js', ROOT).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return next(SERVER_ONLY, context);

    const isAlias = specifier.startsWith('@/');
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    if (!isAlias && !isRelative) return next(specifier, context);

    // Dentro de node_modules manda o Node: um pacote CommonJS resolve
    // `./Cliente` para `.js` e completar-lhe a extensão à força parte-o.
    if (context.parentURL?.includes('/node_modules/')) return next(specifier, context);

    const base = isAlias
      ? new URL(specifier.slice(2), ROOT).href
      : new URL(specifier, context.parentURL).href;

    if (HAS_EXTENSION.test(base)) return next(base, context);

    let lastError;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
      try {
        return next(candidate, context);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  },
});
