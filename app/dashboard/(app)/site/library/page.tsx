import Library from '@/components/dashboard/Library';
import { listMedia } from '@/app/dashboard/library-actions';
import { getDraft } from '@/lib/content-store';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** O layout já redireciona quem não tem sessão, mas o Next renderiza a página
 *  em paralelo com o layout: sem esta linha, a leitura corre à mesma, falha no
 *  RLS e enche o log de erros que escondem os verdadeiros. */
export default async function LibraryPage() {
  await requireUser();
  const [items, content] = await Promise.all([listMedia(), getDraft()]);
  return <Library items={items} niches={content.meet.niches.map((n) => n.name)} />;
}
