import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { publicMediaUrl } from '@/lib/media';
import { MAX_PICK, slug } from '@/lib/media-limits';
import { r2PresignPut } from '@/lib/storage/r2';

export const dynamic = 'force-dynamic';

/** O navegador nunca fala com o R2 sem passar por aqui primeiro: é este
 *  pedido que confere sessão, tipo e tamanho antes de assinar a escrita. A
 *  URL assinada que devolve só autoriza aquele caminho, aquele tipo e
 *  aquele tamanho, e expira em 5 minutos. */
const Body = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().refine(
    (t) => t.startsWith('image/') || t.startsWith('video/'),
    'Só imagem ou vídeo.',
  ),
  size: z.number().int().positive().max(MAX_PICK),
});

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sem sessão.' }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  const { filename, contentType, size } = parsed.data;

  /* Carimbo de tempo garante que dois uploads do mesmo nome nunca colidem —
     o mesmo esquema que já existia no upload direto ao Supabase. */
  const path = `${Date.now()}-${slug(filename)}`;

  try {
    const uploadUrl = await r2PresignPut({ path, contentType, contentLength: size });
    return NextResponse.json({ uploadUrl, path, publicUrl: publicMediaUrl(path) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha desconhecida.';
    return NextResponse.json({ error: `Não foi possível preparar o upload. ${message}` }, { status: 500 });
  }
}
