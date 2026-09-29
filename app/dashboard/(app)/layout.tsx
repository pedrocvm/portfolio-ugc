import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/dashboard/actions';
import Logo from '@/components/dashboard/Logo';
import Menu from '@/components/dashboard/Menu';
import MobileNav from '@/components/dashboard/MobileNav';
import SectionNav from '@/components/dashboard/SectionNav';
import SideToggle from '@/components/dashboard/SideToggle';
import Toasts from '@/components/dashboard/Toasts';
import { requireEditor } from '@/lib/auth';
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
  const { hero } = await getDraft();

  const signOutForm = (
    <form action={signOut}>
      <button className="sideOut" type="submit">
        Sair
      </button>
    </form>
  );

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('side')==='off')document.documentElement.dataset.side='off'}catch(e){}",
        }}
      />
      <div className="shell">
        <aside className="side">
          <Link className="sideName" href="/">
            <Logo first={hero.firstName} last={hero.lastName} />
          </Link>
          <SideToggle />
          <Menu />
          {signOutForm}
        </aside>

        <main className="sheet">
          <SectionNav />
          {children}
        </main>

        <MobileNav onSignOut={signOutForm} />
        {/* O editor do site usa esta âncora para o único FAB que continua útil.
            Conteúdo não injeta nada aqui. */}
        <div className="fabStack" id="fabStack" />
        <Toasts />
      </div>
    </>
  );
}
