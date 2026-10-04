import { z } from 'zod';
import { intakeSchema } from './domain';

export const MAX_REFERENCE_REQUEST_BYTES = 512 * 1024;

export class ReferenceRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const referenceRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('import'), reference: intakeSchema }).strict(),
  z.object({ action: z.literal('complete'), id: z.uuid(), uploadBatchId: z.uuid().nullable().optional() }).strict(),
  z.object({ action: z.literal('heartbeat'), error: z.string().max(1000).nullable().optional(), synced: z.boolean().optional() }).strict(),
]);

/** Conta os bytes efetivamente recebidos. Content-Length é apenas uma
 * recusa antecipada, nunca a proteção principal contra um corpo enorme. */
export async function readReferenceRequest(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ReferenceRequestError('Envie os dados em JSON.', 415);
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength && (!/^\d+$/.test(claimedLength) || Number(claimedLength) > MAX_REFERENCE_REQUEST_BYTES)) {
    throw new ReferenceRequestError('A referência excede o tamanho permitido.', 413);
  }
  if (!request.body) throw new ReferenceRequestError('Envie os dados da referência.', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > MAX_REFERENCE_REQUEST_BYTES) {
        await reader.cancel();
        throw new ReferenceRequestError('A referência excede o tamanho permitido.', 413);
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let json: unknown;
  try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ReferenceRequestError('O JSON enviado é inválido.', 400); }
  const parsed = referenceRequestSchema.safeParse(json);
  if (!parsed.success) throw new ReferenceRequestError(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  return parsed.data;
}
