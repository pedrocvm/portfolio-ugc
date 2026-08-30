import Editor from '@/components/dashboard/Editor';
import { getDraft } from '@/lib/content-store';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  return <Editor initial={await getDraft()} />;
}
