import Link from 'next/link';
import { channelLabel } from '@/lib/brands';
import { euros, type Client } from '@/lib/clients';
import { DOCS, dataPt } from '@/lib/documents';

export default function Clients({ clients }: { clients: Client[] }) {
  const total = clients.reduce((s, c) => s + c.billedCents, 0);

  return (
    <>
      <div className="dashBar">
        <h1>Clientes</h1>
        <span className="dashState">
          {clients.length === 0
            ? 'Nenhum ainda'
            : `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}${total ? ` · ${euros(total)} faturado` : ''}`}
        </span>
      </div>

      {clients.length === 0 ? (
        <p className="libEmpty">
          Um cliente é uma marca que já fechou. Assim que arrastares uma marca
          para <em>Fechada</em> no funil, a ficha dela aparece aqui, com os
          documentos e o que já foi faturado.
        </p>
      ) : (
        <div className="cliList">
          {clients.map((c) => (
            <details className="cli" key={c.brand.id}>
              <summary>
                <span className="cliName">{c.brand.name}</span>
                <span className="cliMeta">
                  {c.works.length === 0
                    ? 'Sem documentos'
                    : `${c.works.length} ${c.works.length === 1 ? 'documento' : 'documentos'}`}
                </span>
                <span className="cliMoney" data-off={!c.billedCents || undefined}>
                  {c.billedCents ? euros(c.billedCents) : 'Por faturar'}
                </span>
              </summary>

              <div className="cliBody">
                <dl className="cliFicha">
                  <div>
                    <dt>Contato</dt>
                    <dd>
                      {c.brand.contact || '—'}
                      <span className="sub">{channelLabel(c.brand.channel)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Instagram</dt>
                    <dd>{c.brand.instagram || '—'}</dd>
                  </div>
                  <div>
                    <dt>Primeira abordagem</dt>
                    <dd>
                      {c.brand.approached_on
                        ? dataPt(c.brand.approached_on)
                        : dataPt(c.brand.created_at.slice(0, 10))}
                    </dd>
                  </div>
                  <div>
                    <dt>Próximo passo</dt>
                    <dd>{c.brand.next_step || '—'}</dd>
                  </div>
                </dl>

                {c.brand.notes ? <p className="said">{c.brand.notes}</p> : null}

                {c.works.length === 0 ? (
                  <p className="cliVazio">
                    Ainda não há documentos com o nome desta marca. Cria a
                    proposta ou o contrato em Documentos e ele aparece aqui.
                  </p>
                ) : (
                  <ul className="cliWorks">
                    {c.works.map((w) => (
                      <li key={w.id}>
                        <span className="pill">{DOCS[w.kind].one}</span>
                        <span className="cliWorkName">{w.title}</span>
                        <span className="cliWorkDate">{dataPt(w.date)}</span>
                        <span className="cliWorkMoney" data-off={!w.billable || undefined}>
                          {w.cents === null ? '—' : euros(w.cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="cliActs">
                  <Link className="btn quiet tiny" href="/dashboard/documents">
                    Documentos
                  </Link>
                  <Link className="btn quiet tiny" href="/dashboard/brands">
                    Editar ficha
                  </Link>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      {clients.length > 0 ? (
        <p className="cliNota">
          Na faturação entram contratos e autorizações de utilização. As
          propostas ficam à vista, mas fora da conta: ainda não são dinheiro.
        </p>
      ) : null}
    </>
  );
}
