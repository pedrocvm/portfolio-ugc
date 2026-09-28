import { notFound } from 'next/navigation';
import Menu from '@/components/dashboard/Menu';
import MobileNav from '@/components/dashboard/MobileNav';
import SectionNav from '@/components/dashboard/SectionNav';
import Harness from './Harness';
import '@/app/dashboard/dashboard.css';

export const dynamic = 'force-dynamic';

/** Bancada visual de desenvolvimento.
 *
 * A navegação usada aqui é a mesma da aplicação real. Depois do reset, o
 * harness não monta CarolAI, notificações, captura rápida nem qualquer outro
 * sistema que deixou de fazer parte da superfície usada pela Carol. */
export default async function HarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const { modo } = await searchParams;
  if (process.env.NODE_ENV === 'production' && process.env.HARNESS !== '1') notFound();

  return (
    <div className="dash">
      <div className="shell">
        <aside className="side">
          <span className="sideName">
            <span className="logoName">Carol</span>
          </span>
          <Menu />
        </aside>
        <main className="sheet">
          <SectionNav />
          <Harness modo={modo} />
        </main>
        <MobileNav onSignOut={null} />
      </div>
    </div>
  );
}
