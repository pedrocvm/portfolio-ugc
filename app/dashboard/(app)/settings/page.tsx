import { requireUser } from '@/lib/auth';
import { hasEncryptionKey } from '@/lib/crypto';
import { hasServiceRole } from '@/lib/supabase/service';
import { aiConfigured } from '@/modules/ai/gateway';
import { aiSetup } from '@/modules/ai/provider';
import { googleConfigured } from '@/modules/integrations/gmail/oauth';
import { instagramConfigured, missingConfig } from '@/modules/integrations/instagram/config';
import { accountForScreen } from '@/modules/integrations/instagram/read';
import { health as instagramHealth } from '@/modules/integrations/instagram/token';
import { activePolicy } from '@/modules/pricing/service';
import { schedulerState } from '@/modules/jobs/scheduler';
import { getFlags, integrationHealths, recentJobs } from '@/modules/settings/service';
import Settings from '@/components/dashboard/os/Settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; instagram?: string }>;
}) {
  await requireUser();
  const [flags, mailboxes, jobs, policy, scheduler, params, igAccount] = await Promise.all([
    getFlags(),
    integrationHealths(),
    recentJobs(),
    activePolicy(),
    schedulerState(),
    searchParams,
    accountForScreen().catch(() => null),
  ]);

  // A saúde do token sai da conta persistida. Sem conta, nem há o que reportar
  // — e o botão diz o que falta no ambiente em vez de não fazer nada em
  // silêncio.
  const saude = igAccount
    ? instagramHealth({
        expiresAt: null,
        status: igAccount.status === 'connected' ? 'connected' : igAccount.status,
        lastRefreshAt: null,
        issuedAt: null,
        lastSuccessAt: igAccount.lastSuccessAt,
      })
    : null;

  return (
    <Settings
      flags={flags}
      mailboxes={mailboxes}
      jobs={jobs}
      googleConfigured={googleConfigured()}
      aiConfigured={aiConfigured()}
      aiKeyName={aiSetup().missing ?? 'a chave de IA'}
      serviceRole={hasServiceRole()}
      encryptionKey={hasEncryptionKey()}
      policyVersion={policy.version}
      policyStatus={policy.status}
      instagram={{
        configured: instagramConfigured(),
        missing: missingConfig(),
        account: igAccount?.username ?? null,
        status: igAccount?.status ?? 'missing',
        message: saude?.message ?? 'O Instagram ainda não está ligado.',
        needsCarol: saude?.needsCarol ?? true,
        lastSyncAt: igAccount?.lastSyncAt ?? null,
        mediaCount: igAccount?.mediaCount ?? 0,
      }}
      notice={params.google ?? (params.instagram ? `instagram-${params.instagram}` : null)}
      scheduler={scheduler}
    />
  );
}
