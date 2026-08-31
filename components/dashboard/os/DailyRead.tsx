import { aiConfigured, runPrompt } from '@/modules/ai/gateway';
import { dailyRead } from '@/modules/ai/prompts/registry';

/** A leitura do dia: o padrão que a contagem não mostra.
 *
 *  Corre dentro de um <Suspense> para não atrasar a fila, e devolve nada
 *  sempre que não tiver nada de útil a dizer — sem modelo configurado, sem
 *  padrão digno de nota, ou porque a chamada falhou. A fila abaixo é o
 *  produto; isto é uma opinião por cima dela. */
export default async function DailyRead({
  brief,
  queue,
  openCount,
}: {
  brief: string;
  queue: string;
  openCount: number;
}) {
  if (!aiConfigured()) return null;

  let read = '';
  try {
    const run = await runPrompt(
      dailyRead,
      { brief, queue, openCount },
      { cache: true, timeoutMs: 12_000 },
    );
    if (run.ok) read = run.output.read.trim();
  } catch {
    read = '';
  }

  return read ? <p className="osRead">{read}</p> : null;
}
