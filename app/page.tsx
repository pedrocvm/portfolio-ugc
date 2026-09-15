import DegradedNotice from '@/components/DegradedNotice';
import Site from '@/components/Site';
import { getNicheMedia, getPublishedOrDefault } from '@/lib/content-store';
import './site.css';

export default async function Page() {
  const [{ content: c, degraded }, media] = await Promise.all([
    getPublishedOrDefault(),
    getNicheMedia(),
  ]);
  return (
    <>
      {degraded ? <DegradedNotice /> : null}
      <Site c={c} media={media} />
    </>
  );
}
