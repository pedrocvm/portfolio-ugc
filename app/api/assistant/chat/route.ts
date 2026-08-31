import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { runAssistant } from '@/modules/assistant/orchestrator';

export const dynamic = 'force-dynamic';
// Um laço de ferramentas com várias rondas passa dos poucos segundos.
export const maxDuration = 300;

const Body = z.object({
  threadId: z.string().uuid(),
  message: z.string().min(1).max(8000),
  entity: z
    .object({
      type: z.enum(['brand', 'opportunity', 'document', 'collaboration', 'content', 'today', 'inbox', 'other']),
      // Só o id atravessa a fronteira. O nome resolve-se no servidor.
      id: z.string().uuid().nullable(),
    })
    .nullable()
    .optional(),
  attachmentIds: z.array(z.string().uuid()).max(6).optional(),
  webResearch: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sem sessão.' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runAssistant({
          threadId: parsed.data.threadId,
          userMessage: parsed.data.message,
          entity: parsed.data.entity ?? null,
          attachmentIds: parsed.data.attachmentIds ?? [],
          webResearch: parsed.data.webResearch ?? false,
          signal: request.signal,
        })) {
          send(event);
        }
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'Falhou.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
