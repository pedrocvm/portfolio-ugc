import 'server-only';

/** Cifra dos refresh tokens de OAuth antes de tocarem na base de dados.
 *  AES-256-GCM do WebCrypto, que o Node 22 e a Vercel já trazem: uma
 *  dependência de criptografia é exatamente o tipo de coisa que não se
 *  acrescenta quando a plataforma já resolve. */

const ALGO = 'AES-GCM';
const IV_BYTES = 12;

let keyPromise: Promise<CryptoKey> | null = null;

function keyMaterial(): Uint8Array {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'Falta APP_ENCRYPTION_KEY (32 bytes em base64). Sem ela não se guardam tokens de integração.',
    );
  }
  const bytes = Uint8Array.from(Buffer.from(raw, 'base64'));
  if (bytes.byteLength !== 32) {
    throw new Error('APP_ENCRYPTION_KEY tem de ser 32 bytes codificados em base64.');
  }
  return bytes;
}

export const hasEncryptionKey = () => {
  try {
    keyMaterial();
    return true;
  } catch {
    return false;
  }
};

function getKey(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey('raw', keyMaterial() as BufferSource, ALGO, false, [
    'encrypt',
    'decrypt',
  ]);
  return keyPromise;
}

/** Devolve `<iv base64>.<ciphertext base64>`. O IV é público por desenho e
 *  novo em cada cifra — reutilizá-lo em GCM anula a garantia toda. */
export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    await getKey(),
    new TextEncoder().encode(plain),
  );
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(cipher).toString('base64')}`;
}

export async function decryptSecret(packed: string): Promise<string> {
  const [ivPart, cipherPart] = packed.split('.');
  if (!ivPart || !cipherPart) throw new Error('Token cifrado com formato inválido.');
  const plain = await crypto.subtle.decrypt(
    { name: ALGO, iv: Uint8Array.from(Buffer.from(ivPart, 'base64')) },
    await getKey(),
    Uint8Array.from(Buffer.from(cipherPart, 'base64')),
  );
  return new TextDecoder().decode(plain);
}

/** Assinatura HMAC do `state` de OAuth e de outros payloads curtos que saem da
 *  aplicação e têm de voltar sem terem sido tocados. */
export async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial() as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Buffer.from(mac).toString('base64url');
}

export async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  const expected = await signPayload(payload);
  // Comparação de tempo constante: um `===` sobre strings sai mais cedo no
  // primeiro byte diferente e isso chega para adivinhar a assinatura byte a byte.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/** Impressão digital estável de um input, para deduplicar corridas de IA e
 *  detectar conteúdo repetido sem salvar o conteúdo outra vez. */
export async function hashContent(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('hex').slice(0, 32);
}
