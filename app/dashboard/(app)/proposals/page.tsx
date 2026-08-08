import Documents from '@/components/dashboard/Documents';
import { listDocs } from '@/app/dashboard/document-actions';
import { getDraft } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const [rows, content] = await Promise.all([listDocs('proposal'), getDraft()]);
  return (
    <Documents
      kind="proposal"
      rows={rows}
      author={{
        name: content.nav.brand,
        role: 'UGC Creator',
        contact: content.contact.instagramHandle,
      }}
    />
  );
}
