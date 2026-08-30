import Documents from '@/components/dashboard/Documents';
import { listDocs } from '@/app/dashboard/document-actions';
import { getDraft } from '@/lib/content-store';
import { DOC_ORDER, type DocKind, type DocRow } from '@/lib/documents';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** O layout já redireciona quem não tem sessão, mas o Next renderiza a página
 *  em paralelo com o layout: sem esta linha, a leitura corre à mesma, falha no
 *  RLS e enche o log de erros que escondem os verdadeiros. */
export default async function DocumentsPage() {
  await requireUser();
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
