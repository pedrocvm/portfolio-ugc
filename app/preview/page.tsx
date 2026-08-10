import type { Metadata } from 'next';
import Live from '@/components/dashboard/Live';
import { requireEditor } from '@/lib/auth';
import { getDraft } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage() {
  await requireEditor();
  return <Live initial={await getDraft()} />;
}
