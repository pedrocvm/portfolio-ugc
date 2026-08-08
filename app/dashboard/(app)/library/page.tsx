import Library from '@/components/dashboard/Library';
import { listMedia } from '@/app/dashboard/library-actions';
import { getDraft } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const [items, content] = await Promise.all([listMedia(), getDraft()]);
  return <Library items={items} niches={content.meet.niches.map((n) => n.name)} />;
}
