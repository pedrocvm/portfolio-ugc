import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { MAX_BYTES, storeAttachment } from '@/modules/assistant/attachments';

export const dynamic = 'force-dynamic';

const Uuid = z.string().uuid();

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sem sessão.' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  const threadId = String(form.get('threadId') ?? '');
  if (!Uuid.safeParse(threadId).success) {
    return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta o ficheiro.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Ficheiro acima de 10 MB.' }, { status: 413 });

  const mode = form.get('mode') === 'knowledge' ? 'knowledge' : 'chat';
  const stored = await storeAttachment({ threadId, file, mode });
  if ('error' in stored) return NextResponse.json({ error: stored.error }, { status: 400 });

  return NextResponse.json({
    id: stored.id, kind: stored.kind, fileName: stored.fileName, byteSize: stored.byteSize,
  });
}
