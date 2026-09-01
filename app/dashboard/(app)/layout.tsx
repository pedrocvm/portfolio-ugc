import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/dashboard/actions';
import Assistant from '@/components/assistant/Assistant';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import Command from '@/components/dashboard/Command';
import Notifications from '@/components/dashboard/Notifications';
import Toasts from '@/components/dashboard/Toasts';
import DiscoveryWatch from '@/components/dashboard/DiscoveryWatch';
import Logo from '@/components/dashboard/Logo';
import Menu from '@/components/dashboard/Menu';
import MobileNav from '@/components/dashboard/MobileNav';
import SectionNav from '@/components/dashboard/SectionNav';
import SideToggle from '@/components/dashboard/SideToggle';
import { requireEditor } from '@/lib/auth';
import { assistantReady } from '@/modules/assistant/config';
import { notifications } from '@/modules/assistant/service';
import { getFlags } from '@/modules/settings/service';
import { getDraft } from '@/lib/content-store';

export const metadata: Metadata = {
  title: 'Área privada',
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireEditor();
  const [{ hero }, flags, alerts] = await Promise.all([getDraft(), getFlags(), notifications()]);

  return (
    <>
      {/* antes da primeira pintura: sem isto a barra abria e recolhia à vista */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('side')==='off')document.documentElement.dataset.side='off'}catch(e){}",
        }}
      />
      <AssistantProvider>
        <div className="shell">
        <aside className="side">
          <Link className="sideName" href="/">
            <Logo first={hero.firstName} last={hero.lastName} />
          </Link>
          <SideToggle />
          <Menu />
          <form action={signOut}>
            <button className="sideOut" type="submit">
              Sair
            </button>
          </form>
        </aside>
        <main className="sheet">
          <SectionNav />
          {children}
        </main>
        <MobileNav
          assistantEnabled={Boolean(flags.assistant_enabled)}
          onSignOut={
            <form action={signOut}>
              <button className="sideOut" type="submit">
                Sair
              </button>
            </form>
          }
        />
          {/* Fixo no topo, em todos as telas. */}
          <Notifications items={alerts} />
          <Toasts />
          <DiscoveryWatch />
          <Command />
          {/* Só na área privada, e só com a bandeira aberta: o portfólio público
              não conhece a Carol AI. */}
          {flags.assistant_enabled ? (
            <Assistant configured={assistantReady()} />
          ) : null}
        </div>
      </AssistantProvider>
    </>
  );
}
