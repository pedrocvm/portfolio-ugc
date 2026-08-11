import type { Metadata } from 'next';
import Live from '@/components/dashboard/Live';
import { requireEditor } from '@/lib/auth';
import { getDraft, getNicheMedia } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage() {
  await requireEditor();
  const [draft, media] = await Promise.all([getDraft(), getNicheMedia()]);
  return <Live initial={draft} media={media} />;
}
