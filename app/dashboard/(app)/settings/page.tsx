import { requireUser } from '@/lib/auth';
import { hasEncryptionKey } from '@/lib/crypto';
import { hasServiceRole } from '@/lib/supabase/service';
import { aiConfigured } from '@/modules/ai/gateway';
import { googleConfigured } from '@/modules/integrations/gmail/oauth';
import { activePolicy } from '@/modules/pricing/service';
import { schedulerState } from '@/modules/jobs/scheduler';
import { getFlags, integrationHealths, recentJobs } from '@/modules/settings/service';
import Settings from '@/components/dashboard/os/Settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  await requireUser();
  const [flags, mailboxes, jobs, policy, scheduler, params] = await Promise.all([
    getFlags(),
    integrationHealths(),
    recentJobs(),
    activePolicy(),
    schedulerState(),
    searchParams,
  ]);

  return (
    <Settings
      flags={flags}
      mailboxes={mailboxes}
      jobs={jobs}
      googleConfigured={googleConfigured()}
      aiConfigured={aiConfigured()}
      serviceRole={hasServiceRole()}
      encryptionKey={hasEncryptionKey()}
      policyVersion={policy.version}
      policyStatus={policy.status}
      notice={params.google ?? null}
      scheduler={scheduler}
    />
  );
}
