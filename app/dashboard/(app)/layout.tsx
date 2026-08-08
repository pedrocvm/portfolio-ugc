import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/dashboard/actions';
import Logo from '@/components/dashboard/Logo';
import Menu from '@/components/dashboard/Menu';
import { requireEditor } from '@/lib/auth';

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

  return (
    <div className="dashGrid">
      <aside className="dashAside">
        <Link className="dashBrand" href="/">
          <Logo />
          Carol Queiroz
          <span>Área privada</span>
        </Link>
        <Menu />
        <form action={signOut}>
          <button className="dashOut" type="submit">
            Sair
          </button>
        </form>
      </aside>
      <main className="dashMain">{children}</main>
    </div>
  );
}
