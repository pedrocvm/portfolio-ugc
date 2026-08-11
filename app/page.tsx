import Site from '@/components/Site';
import { getNicheMedia, getPublished } from '@/lib/content-store';

export default async function Page() {
  const [c, media] = await Promise.all([getPublished(), getNicheMedia()]);
  return <Site c={c} media={media} />;
}
