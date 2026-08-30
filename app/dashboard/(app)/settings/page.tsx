import { requireUser } from '@/lib/auth';
import { hasEncryptionKey } from '@/lib/crypto';
import { hasServiceRole } from '@/lib/supabase/service';
import { aiConfigured } from '@/modules/ai/gateway';
import { googleConfigured } from '@/modules/integrations/gmail/oauth';
import { activePolicy } from '@/modules/pricing/service';
import { getFlags, integrationHealth, recentJobs } from '@/modules/settings/service';
import Settings from '@/components/dashboard/os/Settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  await requireUser();
  const [flags, integration, jobs, policy, params] = await Promise.all([
    getFlags(),
    integrationHealth(),
    recentJobs(),
    activePolicy(),
    searchParams,
  ]);

  return (
    <Settings
      flags={flags}
      integration={integration}
      jobs={jobs}
      googleConfigured={googleConfigured()}
      aiConfigured={aiConfigured()}
      serviceRole={hasServiceRole()}
      encryptionKey={hasEncryptionKey()}
      policyVersion={policy.version}
      policyStatus={policy.status}
      notice={params.google ?? null}
    />
  );
}
