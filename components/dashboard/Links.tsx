'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { discardDraft, publishDraft, saveDraft } from '@/app/dashboard/actions';
import type { Content } from '@/lib/content';
import type { Resumo } from '@/lib/link-stats';
import { LINKS_SECTION } from '@/lib/schema';
import Busy from './Busy';
import { Fields } from './Fields';
import Segmented from './Segmented';
import Spinner from './Spinner';
import { setIn } from './paths';

type State = { tone: 'idle' | 'dirty' | 'ok' | 'bad'; text: string };

const CLEAN: State = { tone: 'idle', text: 'Sem alterações para salvar' };

const APARELHO: Record<string, string> = {
  mobile: 'Celular',
  tablet: 'Tablet',
  desktop: 'Computador',
  desconhecido: 'Desconhecido',
};

const diaCurto = (dia: string) => dia.slice(8) + '/' + dia.slice(5, 7);

export default function Links({
  initial,
  resumos,
}: {
  initial: Content;
  resumos: Resumo[];
}) {
  const [content, setContent] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<State>(CLEAN);
  const [dias, setDias] = useState(String(resumos[1]?.dias ?? resumos[0].dias));
  const [pending, start] = useTransition();
  const router = useRouter();

  const r = resumos.find((x) => String(x.dias) === dias) ?? resumos[0];

  function change(path: string, value: unknown) {
    setContent((c) => setIn(c, path, value));
    setDirty(true);
    setState({ tone: 'dirty', text: 'Alterações não salvas' });
  }

  function save() {
    start(async () => {
      const res = await saveDraft({ links: content.links });
      if (res.error) return setState({ tone: 'bad', text: res.error });
      setDirty(false);
      setState({ tone: 'ok', text: 'Salvo. Ainda não está no ar.' });
    });
  }

  function publish() {
    start(async () => {
      const res = await publishDraft();
      setState(
        res.error
          ? { tone: 'bad', text: res.error }
          : { tone: 'ok', text: 'Publicado. A página já mostra estes links.' },
      );
    });
  }

  function discard() {
    if (!confirm('Restaurar os links com o que está publicado?')) return;
    start(async () => {
      const res = await discardDraft();
      if (res.error) return setState({ tone: 'bad', text: res.error });
      setDirty(false);
      setState(CLEAN);
      router.refresh();
    });
  }

  return (
    <>
      <Busy on={pending} />
      <div className="dashBar">
        <h1>Links</h1>
        <span className="dashState" data-tone={pending ? undefined : state.tone}>
          {pending ? <Spinner label="Salvando" /> : null}
          {pending ? 'Processando' : state.text}
        </span>
        <a className="btn quiet" href="/contato" target="_blank" rel="noopener">
          Abrir a página
        </a>
        <button type="button" className="btn quiet" onClick={discard} disabled={pending}>
          Restaurar
        </button>
        <button type="button" className="btn" onClick={save} disabled={pending || !dirty}>
          salvar
        </button>
        <button
          type="button"
          className="btn solid"
          onClick={publish}
          disabled={pending || dirty}
          title={dirty ? 'Salve as alterações antes de publicar.' : undefined}
        >
          Publicar
        </button>
      </div>

      <section className="sec">
        <div className="secHead">
          <h2>{LINKS_SECTION.title}</h2>
          <p className="said">{LINKS_SECTION.note}</p>
        </div>
        <Fields
          fields={LINKS_SECTION.fields}
          ctx={{ root: content, base: '', onChange: change }}
        />
      </section>

      <section className="sec">
        <div className="secHead">
          <h2>Quem chegou até aqui</h2>
          <p className="said">
            Contado sem cookies e sem salvar nada no aparelho de quem visita.
          </p>
        </div>

        <div className="stBox">
          <Segmented
            label="Período"
            value={dias}
            onChange={setDias}
            options={resumos.map((x) => ({
              id: String(x.dias),
              label: `${x.dias} dias`,
            }))}
          />

          <div className="stCartoes">
            <Numero valor={r.visitas} rotulo="Visitas" />
            <Numero valor={r.cliques} rotulo="Cliques nos links" />
            <Numero valor={r.contatos} rotulo="Contatos" nota="WhatsApp e Instagram" />
            <Numero valor={`${r.taxa}%`} rotulo="Taxa de toque" nota="Visitas que tocaram nalguma coisa" />
          </div>

          {r.visitas + r.cliques === 0 ? (
            <p className="libEmpty">
              Ainda não há acessos neste período. Os números aparecem sozinhos
              assim que alguém abrir sua página de links.
            </p>
          ) : (
            <>
              <Grafico dados={r.porDia} />
              <div className="stTabelas">
                <Tabela
                  titulo="Links mais tocados"
                  linhas={r.ligacoes}
                  total={r.cliques + r.contatos}
                />
                <Tabela titulo="De onde vieram" linhas={r.origens} total={r.visitas} />
                <Tabela
                  titulo="Em que aparelho"
                  linhas={r.aparelhos.map((a) => ({
                    ...a,
                    nome: APARELHO[a.nome] ?? a.nome,
                  }))}
                  total={r.visitas}
                />
                <Tabela titulo="De que país" linhas={r.paises} total={r.visitas} />
              </div>
            </>
          )}
          <p className="hint">
            Compartilhamentos da página no período: {r.partilhas}.
          </p>
        </div>
      </section>
    </>
  );
}

function Numero({
  valor,
  rotulo,
  nota,
}: {
  valor: number | string;
  rotulo: string;
  nota?: string;
}) {
  return (
    <div className="stCartao">
      <strong>{valor}</strong>
      <span>{rotulo}</span>
      {nota ? <em>{nota}</em> : null}
    </div>
  );
}

/** Barras por dia: visitas atrás, toques à frente. Sem eixos — a leitura que
 *  interessa é a forma, e o número exato está no título de cada coluna. */
function Grafico({ dados }: { dados: Resumo['porDia'] }) {
  const teto = Math.max(1, ...dados.map((d) => d.visitas));
  return (
    <div className="stGrafico" role="img" aria-label={`Visitas por dia nos últimos ${dados.length} dias`}>
      {dados.map((d) => (
        <span
          className="stBarra"
          key={d.dia}
          title={`${diaCurto(d.dia)} · ${d.visitas} visitas, ${d.cliques} toques`}
        >
          <i style={{ height: `${(d.visitas / teto) * 100}%` }}>
            <b style={{ height: `${d.visitas ? (d.cliques / Math.max(d.visitas, d.cliques)) * 100 : 0}%` }} />
          </i>
        </span>
      ))}
    </div>
  );
}

function Tabela({
  titulo,
  linhas,
  total,
}: {
  titulo: string;
  linhas: { nome: string; total: number }[];
  total: number;
}) {
  return (
    <div className="stTabela">
      <h3>{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="hint">Sem registros.</p>
      ) : (
        <ol>
          {linhas.slice(0, 6).map((l) => (
            <li key={l.nome}>
              <span
                className="stFatia"
                style={{ '--p': `${total ? (l.total / total) * 100 : 0}%` } as React.CSSProperties}
                aria-hidden="true"
              />
              <span className="stNome">{l.nome}</span>
              <span className="stTotal">{l.total}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
