import { requireUser } from '@/lib/auth';
import Inbox from '@/components/dashboard/os/Inbox';
import { inboxThreads } from '@/modules/inbox/queries';
import { integrationHealth } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  await requireUser();
  const [threads, integration] = await Promise.all([inboxThreads(), integrationHealth()]);

  return (
    <Inbox
      waiting={threads.waiting}
      review={threads.review}
      quiet={threads.quiet}
      gmailConnected={integration.status === 'connected'}
    />
  );
}
