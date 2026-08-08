import { createHash } from 'node:crypto';

/** Comprimento mínimo exigido pela aplicação, independente da configuração do
 *  fornecedor de autenticação. */
export const MIN_PASSWORD = 10;

export function hashParts(password: string) {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

/** A resposta da HaveIBeenPwned vem acolchoada com hashes falsos de contagem
 *  zero, para o pedido não revelar quantos resultados reais existem. */
export function isPwnedIn(body: string, suffix: string) {
  for (const line of body.split('\n')) {
    const [sfx, count] = line.trim().split(':');
    if (sfx === suffix && Number(count) > 0) return true;
  }
  return false;
}

/** Só os primeiros cinco caracteres do hash saem daqui: a palavra-passe nunca
 *  chega à rede, nem inteira nem em hash completo. Se o serviço estiver em
 *  baixo, a troca segue — bloquear seria pior do que não verificar. */
export async function isPwned(password: string) {
  const { prefix, suffix } = hashParts(password);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    return isPwnedIn(await res.text(), suffix);
  } catch {
    return false;
  }
}
