import Documents from '@/components/dashboard/Documents';
import { listDocs } from '@/app/dashboard/document-actions';
import { getDraft } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const [rows, content] = await Promise.all([listDocs('contract'), getDraft()]);
  return (
    <Documents
      kind="contract"
      rows={rows}
      author={{
        name: content.nav.brand,
        role: 'UGC Creator',
        contact: content.contact.instagramHandle,
      }}
    />
  );
}
