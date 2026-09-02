import { requireUser } from '@/lib/auth';
import Capture from '@/components/dashboard/os/Capture';
import { listCaptures } from '@/modules/capture/service';
import { getFocus } from '@/app/dashboard/outreach-actions';

export const dynamic = 'force-dynamic';

export default async function CapturePage() {
  await requireUser();
  // O foco dela é o que permite ao cartão responder «isto é para mim?». Sem
  // chave de serviço vem o foco por omissão, e a pergunta continua tendo
  // resposta — só menos afinada.
  const [todas, focus] = await Promise.all([listCaptures(), getFocus()]);
  const drafts = todas.filter((d) => d.status !== 'applied');
  return <Capture drafts={drafts} focusLabels={focus.niches.map((n) => n.label)} />;
}
