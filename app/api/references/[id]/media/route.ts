import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { referenceErrorMessage, referenceMediaUrl, ReferenceServiceError } from '@/modules/saved-references/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await currentUser()) return NextResponse.json({ error: 'Entre no CarolOS para ver esse arquivo.' }, {
    status: 401, headers: { 'Cache-Control': 'private, no-store' },
  });
  const { id } = await context.params;
  const index = Number(new URL(request.url).searchParams.get('index') ?? '0');
  try {
    const url = await referenceMediaUrl(id, index);
    return NextResponse.redirect(url, { status: 307, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: referenceErrorMessage(error) }, {
      status: error instanceof ReferenceServiceError ? error.status : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
