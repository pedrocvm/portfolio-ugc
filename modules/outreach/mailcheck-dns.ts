import 'server-only';

import { resolveMx } from 'node:dns/promises';
import { classify, domainOf, type CheckInput, type CheckResult } from './mailcheck';

/** A única parte que sai para a rede: perguntar ao DNS se o domínio recebe
 *  email. É uma consulta pública, não custa nada e não precisa de conta. */

/** O DNS repete-se muito numa corrida — várias candidatas do mesmo domínio, e
 *  o mesmo domínio outra vez no envio. salva-se por processo. */
const seen = new Map<string, { mx: boolean | null; at: number }>();
const TTL = 30 * 60 * 1000;

export async function domainHasMx(domain: string): Promise<boolean | null> {
  const key = domain.toLowerCase();
  const hit = seen.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.mx;

  let mx: boolean | null;
  try {
    const records = await Promise.race([
      resolveMx(key),
      // Sem tecto, um domínio que não responde pendura a corrida toda.
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    mx = records.length > 0;
  } catch (error) {
    const code = (error as { code?: string }).code;
    // ENOTFOUND e ENODATA são respostas: o domínio não recebe email. Tudo o
    // resto é o DNS a falhar, e isso é «não sei», não «não existe».
    mx = code === 'ENOTFOUND' || code === 'ENODATA' ? false : null;
  }

  seen.set(key, { mx, at: Date.now() });
  return mx;
}

export async function checkEmail(
  email: string,
  source: CheckInput['source'],
): Promise<CheckResult> {
  const domain = domainOf(email);
  if (!domain) return classify({ email, source, domainHasMx: null });
  return classify({ email, source, domainHasMx: await domainHasMx(domain) });
}
