import type { Metadata } from 'next';
import Site from '@/components/Site';
import { requireEditor } from '@/lib/auth';
import { getDraft } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage() {
  await requireEditor();
  return <Site c={await getDraft()} />;
}
