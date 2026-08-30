import { requireUser } from '@/lib/auth';
import { getDraft } from '@/lib/content-store';
import { listMedia } from '@/app/dashboard/library-actions';
import Cases from '@/components/dashboard/os/Cases';
import { listCases } from '@/modules/cases/service';

export const dynamic = 'force-dynamic';

export default async function CasesPage() {
  await requireUser();
  const [cases, media, content] = await Promise.all([listCases(), listMedia(), getDraft()]);

  return (
    <Cases
      cases={cases}
      media={media.map((m) => ({ id: m.id, title: m.title, url: m.url, kind: m.kind, niche: m.niche }))}
      niches={content.meet.niches.map((n) => n.name).filter(Boolean)}
    />
  );
}
