import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { opportunityTimeline } from '@/modules/activity/service';
import { briefsFor } from '@/modules/briefs/service';
import { closeoutStatus } from '@/modules/cases/service';
import { contentFor } from '@/modules/content/service';
import { deliverablesFor, getCollaboration, STATUS_LABEL } from '@/modules/production/service';
import ProductionDesk from '@/components/dashboard/os/ProductionDesk';
import Multiplier from '@/components/dashboard/os/Multiplier';
import ScriptDesk from '@/components/dashboard/os/ScriptDesk';
import Timeline from '@/components/dashboard/os/Timeline';

export const dynamic = 'force-dynamic';

export default async function CollaborationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const collaboration = await getCollaboration(id);
  if (!collaboration) notFound();

  const [briefs, deliverables, closeout, content, timeline] = await Promise.all([
    briefsFor(id),
    deliverablesFor(id),
    closeoutStatus(id),
    contentFor(id),
    opportunityTimeline(collaboration.opportunityId),
  ]);

  return (
    <>
      <div className="dashBar">
        <h1>{collaboration.brandName}</h1>
        <span className="osTag" data-tone="mute">{STATUS_LABEL[collaboration.status]}</span>
        <Link className="chip" href={`/dashboard/opportunities/${collaboration.opportunityId}`}>
          Ver a negociação
        </Link>
      </div>

      <ProductionDesk
        collaboration={collaboration}
        briefs={briefs}
        deliverables={deliverables}
        closeout={closeout}
      />

      <Multiplier collaborationId={id} />

      <ScriptDesk
        collaborationId={id}
        brandId={collaboration.brandId}
        content={content}
      />

      <section className="osSection">
        <h2>História</h2>
        <Timeline entries={timeline} />
      </section>
    </>
  );
}
