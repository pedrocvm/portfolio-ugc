import { after, NextResponse } from 'next/server';
import { SUPABASE_URL } from '@/lib/supabase/config';
import { supabaseService } from '@/lib/supabase/service';
import {
  authenticateReferenceConnection, completeReferenceUpload, heartbeatReferenceConnection,
  importReferenceFromConnection, referenceErrorMessage, referencesEnabled,
  ReferenceServiceError, type ReferenceDb,
} from '@/modules/saved-references/service';
import { processPendingReferences, processReference } from '@/modules/saved-references/processor';
import { readReferenceRequest, ReferenceRequestError } from '@/modules/saved-references/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const headers = { 'Cache-Control': 'private, no-store' };

function schedule(id?: string) {
  after(async () => {
    try {
      if (id) await processReference(id);
      else await processPendingReferences(2);
    } catch {
      // Uma entrega posterior retoma a fila persistente, sem cron legado.
    }
  });
}

export async function POST(request: Request) {
  try {
    if (!referencesEnabled()) return NextResponse.json({ error: 'As referências estão pausadas.' }, { status: 503, headers });
    const authorization = request.headers.get('authorization');
    if (!await authenticateReferenceConnection(authorization)) {
      return NextResponse.json({ error: 'Conexão inválida ou pausada. Confira o token no CarolOS.' }, {
        status: 401, headers: { ...headers, 'WWW-Authenticate': 'Bearer realm="CarolOS references"' },
      });
    }
    const input = await readReferenceRequest(request);
    // Um corpo lento não mantém uma conexão revogada autorizada em memória.
    const connection = await authenticateReferenceConnection(authorization);
    if (!connection) return NextResponse.json({ error: 'Essa conexão foi pausada ou substituída.' }, { status: 401, headers });
    if (input.action === 'heartbeat') {
      await heartbeatReferenceConnection(connection, input);
      schedule();
      return NextResponse.json({
        ok: true, storageOrigin: new URL(SUPABASE_URL).origin,
        collectionName: connection.collectionName, pollSeconds: connection.pollSeconds,
      }, { headers });
    }
    if (input.action === 'complete') {
      await completeReferenceUpload(input.id, {
        db: supabaseService() as unknown as ReferenceDb, connection, uploadBatchId: input.uploadBatchId,
      });
      schedule(input.id);
      return NextResponse.json({ ok: true, id: input.id, completed: true }, { headers });
    }
    const result = await importReferenceFromConnection(input.reference, connection);
    await heartbeatReferenceConnection(connection, {});
    if (result.id && result.uploads.length === 0) schedule(result.id);
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 201, headers });
  } catch (error) {
    if (error instanceof ReferenceRequestError || error instanceof ReferenceServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    return NextResponse.json({ error: referenceErrorMessage(error) }, { status: 503, headers });
  }
}
