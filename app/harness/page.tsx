import { notFound } from 'next/navigation';
import Menu from '@/components/dashboard/Menu';
import MobileNav from '@/components/dashboard/MobileNav';
import SectionNav from '@/components/dashboard/SectionNav';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import Harness from './Harness';
import '@/app/dashboard/dashboard.css';

// Lê o ambiente a cada pedido: pré-renderizada, a guarda ficava decidida no build.
export const dynamic = 'force-dynamic';

/** Bancada de desenvolvimento. Não existe em produção.
 *
 *  As telas verdadeiras vivem atrás de sessão, e não há credencial da Carol
 *  nem projeto Supabase descartável. Sem isto, a única forma de decidir
 *  aparência era ler JSX — que é como se aprovam coisas que ninguém viu.
 *
 *  O que corre aqui são os componentes verdadeiros, com dados de exemplo com a
 *  forma do esquema real. O que não se exercita é a leitura de dados com
 *  sessão; isso fica dito no relatório e não fingido aqui. */
export default function HarnessPage() {
  // Fora de desenvolvimento só existe se alguém a ligar de propósito. A Vercel
  // não tem `HARNESS` no ambiente, por isso lá não existe — e um build de
  // produção local, que é onde as capturas saem estáveis, consegue servi-la.
  if (process.env.NODE_ENV === 'production' && process.env.HARNESS !== '1') notFound();

  return (
    <div className="dash">
      <AssistantProvider>
        <div className="shell">
          <aside className="side">
            <span className="sideName">
              <span className="logoName">Carol</span>
            </span>
            <Menu />
          </aside>
          <main className="sheet">
            <SectionNav />
            <Harness />
          </main>
          <MobileNav assistantEnabled onSignOut={null} />
        </div>
      </AssistantProvider>
    </div>
  );
}
