import Documents from '@/components/dashboard/Documents';
import { listDocs } from '@/app/dashboard/document-actions';
import { getDraft } from '@/lib/content-store';
import { DOC_ORDER, type DocKind, type DocRow } from '@/lib/documents';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const [listas, content] = await Promise.all([
    Promise.all(DOC_ORDER.map((k) => listDocs(k))),
    getDraft(),
  ]);

  const docs = Object.fromEntries(
    DOC_ORDER.map((k, i) => [k, listas[i]]),
  ) as Record<DocKind, DocRow[]>;

  return (
    <Documents
      docs={docs}
      author={{
        name: content.nav.brand,
        role: 'UGC Creator',
        contact: content.contact.instagramHandle,
      }}
    />
  );
}
