import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { isJobName, runAllJobs, runJob, JOBS } from '@/modules/jobs/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Ponto de entrada dos trabalhos de fundo.
 *
 *  Duas formas de autorizar, e nenhuma delas é «público»:
 *   - `Authorization: Bearer <CRON_SECRET>`, que é como a Vercel Cron chama;
 *   - sessão autenticada, que é como a Carol carrega em «sincronizar agora».
 *
 *  Sem CRON_SECRET definido, a via automática fica fechada em vez de aberta:
 *  um endpoint que corre sincronizações não pode ficar acessível por omissão
 *  só porque falta configuração. */
function authorizedByCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (provided.length !== secret.length) return false;

  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

async function handle(request: NextRequest, job: string) {
  const viaCron = authorizedByCron(request);
  const viaSession = viaCron ? null : await currentUser();

  if (!viaCron && !viaSession) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  if (job === 'all') {
    return NextResponse.json({ results: await runAllJobs() });
  }

  if (!isJobName(job)) {
    return NextResponse.json({ error: 'Trabalho desconhecido.', known: [...JOBS, 'all'] }, { status: 404 });
  }

  return NextResponse.json(await runJob(job));
}

/** GET porque é assim que a Vercel Cron chama; POST para o botão manual. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, (await ctx.params).job);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, (await ctx.params).job);
}
