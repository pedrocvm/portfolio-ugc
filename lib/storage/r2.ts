import 'server-only';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** R2 fala S3 pelo mesmo SDK, só muda o endpoint e a região. `auto` é o que a
 *  Cloudflare pede — tentar adivinhar uma região real só causa erro de
 *  assinatura. As três variáveis são server-only: aparecer no bundle do
 *  cliente seria dar a chave de escrita a quem abrir o DevTools. */
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET = process.env.R2_BUCKET ?? 'carol-ugc-media-prod';

function client(): S3Client {
  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new Error(
      'Faltam R2_ACCOUNT_ID, R2_ACCESS_KEY_ID ou R2_SECRET_ACCESS_KEY.',
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  });
}

/** URL assinada de curta duração para o navegador subir o arquivo direto ao
 *  R2. O servidor nunca vê os bytes — só autoriza o caminho, o tipo e valida
 *  o tamanho antes de assinar. */
export async function r2PresignPut(params: {
  path: string;
  contentType: string;
  contentLength: number;
  bucket?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: params.bucket ?? R2_BUCKET,
    Key: params.path,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  return getSignedUrl(client(), cmd, { expiresIn: params.expiresInSeconds ?? 300 });
}

/** Apagar não pode depender de credencial no navegador — por isso é sempre o
 *  servidor que chama isto, nunca uma URL assinada de DELETE. */
export async function r2DeleteObject(path: string, bucket?: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({ Bucket: bucket ?? R2_BUCKET, Key: path }),
  );
}

/** Confirma que o objeto existe no R2 e devolve o tamanho — é o que a
 *  migração usa para validar a cópia sem precisar ler o arquivo de volta. */
export async function r2HeadObject(
  path: string,
  bucket?: string,
): Promise<{ exists: boolean; size?: number; contentType?: string }> {
  try {
    const out = await client().send(
      new HeadObjectCommand({ Bucket: bucket ?? R2_BUCKET, Key: path }),
    );
    return { exists: true, size: out.ContentLength, contentType: out.ContentType };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === 'NotFound' || name === 'NoSuchKey') return { exists: false };
    throw err;
  }
}

/** Usada só pelo script de migração, que sobe o arquivo já em disco em vez de
 *  gerar uma URL assinada para si mesmo. */
export async function r2PutObject(params: {
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  bucket?: string;
}): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: params.bucket ?? R2_BUCKET,
      Key: params.path,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}
