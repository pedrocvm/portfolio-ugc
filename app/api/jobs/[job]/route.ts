import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { isJobName, processedCount, runAllJobs, runJob, JOBS } from '@/modules/jobs/runner';
import { confirmDispatch } from '@/modules/jobs/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Ponto de entrada dos trabalhos de fundo.
 *
 *  Quem chama isto é o pg_cron do Supabase, através do pg_net — a Vercel deixou
 *  de ter cron porque o plano Hobby só permite um por dia, e o Gmail precisa de
 *  ser visto de quinze em quinze minutos.
 *
 *  Duas formas de autorizar, e nenhuma delas é «público»:
 *   - `Authorization: Bearer <CRON_SECRET>`, que é como o Supabase chama;
 *   - sessão autenticada, que é como a Carol carrega em «correr agora».
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O id do disparo viaja no corpo do POST que o pg_net faz. Confirmar por id
 *  exato é melhor do que a reconciliação adivinhar por proximidade de horas —
 *  e é o que permite salvar quantas coisas o trabalho tocou. */
async function dispatchIdFrom(request: NextRequest): Promise<string | null> {
  if (request.method !== 'POST') return null;
  const body = (await request.json().catch(() => null)) as { dispatch_id?: unknown } | null;
  const id = body?.dispatch_id;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

async function handle(request: NextRequest, job: string) {
  const viaCron = authorizedByCron(request);
  const viaSession = viaCron ? null : await currentUser();

  if (!viaCron && !viaSession) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const dispatchId = viaCron ? await dispatchIdFrom(request) : null;

  try {
    if (job === 'all') {
      const results = await runAllJobs();
      const failed = results.filter((r) => r.status === 'error');
      if (dispatchId) {
        await confirmDispatch(dispatchId, {
          ok: failed.length === 0,
          processed: results.reduce((sum, r) => sum + processedCount(r), 0),
          error: failed.map((r) => r.job).join(', ') || undefined,
        });
      }
      return NextResponse.json({ results });
    }

    if (!isJobName(job)) {
      return NextResponse.json({ error: 'Trabalho desconhecido.', known: [...JOBS, 'all'] }, { status: 404 });
    }

    const result = await runJob(job);
    if (dispatchId) {
      await confirmDispatch(dispatchId, {
        ok: result.status !== 'error',
        processed: processedCount(result),
        error: result.status === 'error' ? JSON.stringify(result.detail).slice(0, 400) : undefined,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    // Uma excepção que escape ao runner não pode deixar o disparo em aberto: a
    // reconciliação iria marcá-lo como perdido e o recuo nunca arrancava.
    const message = error instanceof Error ? error.message : 'Falha desconhecida.';
    if (dispatchId) await confirmDispatch(dispatchId, { ok: false, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET para chamadas manuais; POST é o que o pg_net faz. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, (await ctx.params).job);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, (await ctx.params).job);
}
