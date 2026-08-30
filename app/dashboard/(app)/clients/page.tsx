import Clients from '@/components/dashboard/Clients';
import { listBrands } from '@/app/dashboard/brand-actions';
import { listDocs } from '@/app/dashboard/document-actions';
import { buildClients } from '@/lib/clients';
import { DOC_ORDER } from '@/lib/documents';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** O layout já redireciona quem não tem sessão, mas o Next renderiza a página
 *  em paralelo com o layout: sem esta linha, a leitura corre à mesma, falha no
 *  RLS e enche o log de erros que escondem os verdadeiros. */
export default async function ClientsPage() {
  await requireUser();
  const [brands, listas] = await Promise.all([
    listBrands(),
    Promise.all(DOC_ORDER.map((k) => listDocs(k))),
  ]);

  return <Clients clients={buildClients(brands, listas.flat())} />;
}
