import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { label } from '@/lib/labels';
import { CAPABILITY_LABEL, FUNNEL_LABEL, capabilityInventory, listContent, type FunnelRole } from '@/modules/content/service';
import { contentBank, todayContent } from '@/modules/creator/plan-service';
import {
  bragaSeries,
  brollBank,
  contentLearnings,
  latestPerformanceByIdea,
  reelsTestLab,
  seedFromMentor,
  socialProofVault,
  strategyScreen,
} from '@/modules/creator/content-os-service';
import { usableTrends } from '@/modules/trends/service';
import ContentBank from '@/components/dashboard/os/ContentBank';
import ContentStrategy from '@/components/dashboard/os/ContentStrategy';
import ContentStudio from '@/components/dashboard/os/ContentStudio';
import { isStudioTab, type StudioTab } from '@/components/dashboard/os/studioTabs';
import ContentVault from '@/components/dashboard/os/ContentVault';
import Published from '@/components/dashboard/os/Published';
import ReelsTestLab from '@/components/dashboard/os/ReelsTestLab';

export const dynamic = 'force-dynamic';

/** O Conteúdo.
 *
 *  Para gravar, testes, publicado, banco — e a estratégia atrás, para quando
 *  ela quiser aprofundar. O conteúdo dela e o conteúdo das marcas vivem na
 *  mesma tela de propósito: são o mesmo trabalho visto de dois lados. */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; tab?: string }>;
}) {
  await requireUser();
  const { idea, tab } = await searchParams;

  // Idempotente e barato: Braga Real, as experiências e o feedback da
  // Charabanc existem antes de a primeira manhã correr.
  await seedFromMentor().catch(() => null);

  const [content, inventory, hoje, banco, trends, lab, broll, braga, proof, screen, learnings, performance] = await Promise.all([
    listContent(),
    capabilityInventory(),
    todayContent().catch(() => []),
    contentBank().catch(() => []),
    usableTrends(8).catch(() => []),
    reelsTestLab(),
    brollBank(40),
    bragaSeries(),
    socialProofVault(),
    strategyScreen(),
    contentLearnings(3),
    latestPerformanceByIdea(),
  ]);

  const byRole = (role: FunnelRole) => content.filter((c) => c.funnelRole === role);
  const publicadas = banco.filter((i) => i.status === 'recorded' || i.status === 'published');
  const salvas = banco.filter((i) => i.status === 'saved');
  const sementes = banco.filter((i) => i.status === 'seed');
  const aberta = idea ? banco.find((i) => i.id === idea) : undefined;

  const initial: StudioTab = isStudioTab(tab)
    ? tab
    : aberta && (aberta.status === 'recorded' || aberta.status === 'published')
      ? 'published'
      : aberta && aberta.status === 'saved'
        ? 'bank'
        : 'record';

  return (
    <>
      <div className="dashBar">
        <h1>Conteúdo</h1>
        <span className="dashState">
          {hoje.length ? `${hoje.length} para gravar hoje` : `${content.length} peças`}
        </span>
      </div>

      <ContentStudio
        initial={initial}
        panes={{
          record: <ContentBank today={hoje} bank={banco.filter((i) => i.status !== 'seed')} trends={trends} openId={idea} />,
          tests: <ReelsTestLab lab={lab} />,
          published: (
            <>
              <Published pieces={publicadas} performance={Object.fromEntries(performance)} learnings={learnings} />
              <BrandPieces content={content} inventory={inventory} byRole={byRole} />
            </>
          ),
          bank: <ContentVault saved={salvas} seeds={sementes} broll={broll} braga={braga} proof={proof} />,
          strategy: <ContentStrategy screen={screen} />,
        }}
      />
    </>
  );
}

/** O portfólio como banco de capacidades. Serve para responder a uma pergunta
 *  concreta: quando uma marca pede um exemplo, qual é a peça que responde à
 *  dúvida dela? E, do outro lado, que competência ainda falta demonstrar. */
function BrandPieces({
  content,
  inventory,
  byRole,
}: {
  content: Awaited<ReturnType<typeof listContent>>;
  inventory: Awaited<ReturnType<typeof capabilityInventory>>;
  byRole: (role: FunnelRole) => Awaited<ReturnType<typeof listContent>>;
}) {
  return (
    <>
      <h2 className="osDivider">Para as marcas</h2>
      <p className="osNote">
        Cada peça é uma hipótese com uma função no funil e uma competência demonstrada. É isto que
        permite escolher o exemplo certo em vez de mandar o portfólio inteiro.
      </p>

      {inventory.length ? (
        <section className="osSection">
          <h2>Repertório</h2>
          <div className="osBars">
            {inventory.map((c) => {
              const max = Math.max(...inventory.map((x) => x.count), 1);
              return (
                <div className="osBar" key={c.capability}>
                  <span>{CAPABILITY_LABEL[c.capability] ?? c.capability}</span>
                  <i style={{ width: `${(c.count / max) * 100}%` }} />
                  <b>{c.count}</b>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {(['DISCOVERY', 'CONSIDERATION', 'DECISION'] as FunnelRole[]).map((role) => {
        const list = byRole(role);
        if (!list.length) return null;
        return (
          <section className="osSection" key={role}>
            <h2>{FUNNEL_LABEL[role]}</h2>
            <div className="osRows">
              {list.map((c) => (
                <div className="osRow" key={c.id}>
                  <div>
                    <span className="osRowName">{c.title}</span>
                    <p className="osRowSub">
                      {c.brandName}
                      {c.hook ? ` · ${c.hook}` : ''}
                    </p>
                    {c.capabilities.length ? (
                      <div className="osMeta">
                        {c.capabilities.map((x) => (
                          <span key={x} className="osTag" data-tone="mute">
                            {CAPABILITY_LABEL[x] ?? x}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="osRowSide">
                    <span className="osTag" data-tone={c.status === 'approved' ? 'won' : 'mute'}>
                      {label('contentStatus', c.status)}
                    </span>
                    {c.collaborationId ? (
                      <Link className="chip" href={`/dashboard/production/${c.collaborationId}`}>Abrir</Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {content.filter((c) => !c.funnelRole).length ? (
        <section className="osSection">
          <h2>Sem função definida</h2>
          <p className="osNote">Uma peça sem papel no funil é um arquivo, não um argumento de venda.</p>
          <div className="osRows">
            {content.filter((c) => !c.funnelRole).map((c) => (
              <div className="osRow" key={c.id}>
                <div>
                  <span className="osRowName">{c.title}</span>
                  <p className="osRowSub">{c.brandName}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {content.length === 0 ? (
        <p className="osEmpty">
          Ainda não há conteúdo planeado para marcas. As peças nascem dentro de uma colaboração, em Produção.
        </p>
      ) : null}
    </>
  );
}
