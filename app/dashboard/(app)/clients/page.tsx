import Clients from '@/components/dashboard/Clients';
import { listBrands } from '@/app/dashboard/brand-actions';
import { listDocs } from '@/app/dashboard/document-actions';
import { buildClients } from '@/lib/clients';
import { DOC_ORDER } from '@/lib/documents';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const [brands, listas] = await Promise.all([
    listBrands(),
    Promise.all(DOC_ORDER.map((k) => listDocs(k))),
  ]);

  return <Clients clients={buildClients(brands, listas.flat())} />;
}
