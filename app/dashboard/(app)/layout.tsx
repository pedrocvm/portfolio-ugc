import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/dashboard/actions';
import Command from '@/components/dashboard/Command';
import Logo from '@/components/dashboard/Logo';
import Menu from '@/components/dashboard/Menu';
import MobileNav from '@/components/dashboard/MobileNav';
import SideToggle from '@/components/dashboard/SideToggle';
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

  return (
    <>
      {/* antes da primeira pintura: sem isto a barra abria e recolhia à vista */}
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
          <form action={signOut}>
            <button className="sideOut" type="submit">
              Sair
            </button>
          </form>
        </aside>
        <main className="sheet">{children}</main>
        <MobileNav
          onSignOut={
            <form action={signOut}>
              <button className="sideOut" type="submit">
                Sair
              </button>
            </form>
          }
        />
        <Command />
      </div>
    </>
  );
}
