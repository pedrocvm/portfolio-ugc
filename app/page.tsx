import Site from '@/components/Site';
import { getPublished } from '@/lib/content-store';

export default async function Page() {
  return <Site c={await getPublished()} />;
}
