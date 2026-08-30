import Funnel from '@/components/dashboard/Funnel';
import { listBrands } from '@/app/dashboard/brand-actions';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** O layout já redireciona quem não tem sessão, mas o Next renderiza a página
 *  em paralelo com o layout: sem esta linha, a leitura corre à mesma, falha no
 *  RLS e enche o log de erros que escondem os verdadeiros. */
export default async function FunnelPage() {
  await requireUser();
  return <Funnel brands={await listBrands()} />;
}
