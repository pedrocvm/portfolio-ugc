'use client';

import { useMemo, useState, useTransition } from 'react';
import { startBrandImport } from '@/app/dashboard/outreach-actions';
import Spinner from '@/components/dashboard/Spinner';
import { watchImport } from '@/components/dashboard/DiscoveryWatch';
import { pushToast } from '@/components/dashboard/Toasts';
import { IMPORT_LIMITS, parseBrandList } from '@/modules/outreach/import';

/** «Já tenho marcas».
 *
 *  A Carol encontra marcas sozinha — no Instagram, numa viagem, numa indicação.
 *  Quando isso acontece, o trabalho dela acabou: separou dez hotéis. Obrigá-la a
 *  procurá-los outra vez aqui dentro, um a um, é desfazer o que ela já fez.
 *
 *  Por isso esta tela pede uma coisa só: cole. O reconhecimento é imediato e do
 *  lado do browser — ela vê o que eu percebi antes de gastar um tostão — e a
 *  pesquisa segue em segundo plano, sem a prender aqui. */
export default function ImportBrands() {
  const [texto, setTexto] = useState('');
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [emCurso, setEmCurso] = useState<{ total: number } | null>(null);

  // O parse é puro e corre aqui: mostrar o que eu percebi custa zero e evita
  // que ela descubra um engano depois de dez pesquisas pagas.
  const lista = useMemo(() => parseBrandList(texto), [texto]);
  const total = lista.items.length;
  const excede = total > IMPORT_LIMITS.max;

  const enviar = () => {
    setErro('');
    start(async () => {
      const r = await startBrandImport(texto);
      if (r.error) {
        setErro(r.error);
        pushToast(r.error, 'warn');
        return;
      }
      if (r.runId) watchImport(r.runId);
      setEmCurso({ total: r.total ?? total });
      setTexto('');
      pushToast(
        r.resumed
          ? 'Esse lote já estava a caminho. Continuo de onde ficou.'
          : `Recebi ${r.total ?? total} marcas. Vou pesquisar todas e aviso quando estiverem prontas.`,
      );
    });
  };

  if (emCurso) {
    return (
      <div className="impBox" aria-live="polite">
        <h2>Estou pesquisando {emCurso.total} marcas</h2>
        <p className="impNota">
          Pode continuar usando o CarolOS ou fechar a tela. Aviso quando terminar, e as
          abordagens ficam prontas aqui — nenhuma sai sem o seu sim.
        </p>
        <button className="osPageBtn" type="button" onClick={() => setEmCurso(null)}>
          Colar outra lista
        </button>
      </div>
    );
  }

  return (
    <div className="impBox">
      <h2>Já tenho as marcas</h2>
      <p className="impNota">
        Cole os nomes, sites ou perfis que você separou. Um por linha. Eu pesquiso cada uma e
        deixo as abordagens prontas.
      </p>

      <label className="buscaLabel" htmlFor="imp-lista">
        A sua lista
      </label>
      <textarea
        id="imp-lista"
        className="impArea"
        rows={9}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={'Six Senses Douro Valley\nhttps://www.instagram.com/quintadapacheca/\nQuinta da Pacheca\n@marca\nhttps://marca.com'}
      />

      {total > 0 ? (
        <div className="impPrev">
          <p className="impCount">
            <b>
              {total === 1 ? 'Encontrei 1 marca' : `Encontrei ${total} marcas`} na sua lista.
            </b>{' '}
            {lista.ignored.length === 0
              ? 'Nenhuma linha ficou de fora.'
              : `${lista.ignored.length === 1 ? '1 linha ficou' : `${lista.ignored.length} linhas ficaram`} de fora.`}
            {lista.duplicates
              ? ` ${lista.duplicates === 1 ? '1 estava repetida' : `${lista.duplicates} estavam repetidas`}.`
              : ''}
          </p>

          {/* O que eu percebi de cada linha, à vista. Um @ que eu li mal
              aparece aqui, não daqui a quatro minutos. */}
          <ul className="impChips">
            {lista.items.map((c) => (
              <li key={c.rawInput} data-weak={c.confidence < 0.6 ? '' : undefined}>
                {c.detectedName}
                {c.cityHint ? <small> · {c.cityHint}</small> : null}
              </li>
            ))}
          </ul>

          {lista.ignored.length ? (
            <p className="impIgnored">Não percebi: {lista.ignored.slice(0, 5).join(' · ')}</p>
          ) : null}
        </div>
      ) : null}

      {excede ? (
        <p className="osWarn" role="alert">
          São {total} marcas e eu trato até {IMPORT_LIMITS.max} de cada vez. Divida em dois lotes —
          isto é prospecção artesanal, não disparo em massa.
        </p>
      ) : null}

      {erro ? (
        <p className="osWarn" role="alert">
          {erro}
        </p>
      ) : null}

      <button
        className="osGo"
        type="button"
        disabled={pending || total === 0 || excede}
        onClick={enviar}
      >
        {pending ? <Spinner label="Começando" /> : null}
        {total === 0
          ? 'Pesquisar essas marcas'
          : total === 1
            ? 'Pesquisar 1 marca'
            : `Pesquisar ${total} marcas`}
      </button>

      <p className="buscaNota">
        Estas são as marcas que você escolheu. Não procuro substitutas nem acrescento nada à
        lista: pesquiso essas, e digo o que encontrar em cada uma.
      </p>
    </div>
  );
}
