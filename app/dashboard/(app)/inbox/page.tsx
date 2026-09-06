import { requireUser } from '@/lib/auth';
import Inbox from '@/components/dashboard/os/Inbox';
import { inboxThreads } from '@/modules/inbox/queries';
import { integrationHealth } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';

/** `?thread=` abre a conversa logo. É o link que o Hoje e a busca usam — e
 *  chegava aqui a uma lista, com a conversa certa algures no meio. */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  await requireUser();
  const [threads, integration, { thread }] = await Promise.all([inboxThreads(), integrationHealth(), searchParams]);

  return (
    <Inbox
      waiting={threads.waiting}
      review={threads.review}
      quiet={threads.quiet}
      gmailConnected={integration.status === 'connected'}
      openThreadId={thread ?? null}
    />
  );
}
