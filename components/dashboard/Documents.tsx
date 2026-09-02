'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Busy from './Busy';
import Spinner from './Spinner';
import {
  createDoc,
  removeDoc,
  saveDoc,
} from '@/app/dashboard/document-actions';
import {
  DOCS,
  DOC_ORDER,
  type Author,
  type DocKind,
  type DocRow,
} from '@/lib/documents';
import DocumentView from './DocumentView';
import { Fields } from './Fields';
import Segmented from './Segmented';
import { setIn } from './paths';

export default function Documents({
  docs,
  author,
}: {
  docs: Record<DocKind, DocRow[]>;
  author: Author;
}) {
  const [kind, setKind] = useState<DocKind>('proposal');
  const spec = DOCS[kind];
  const rows = docs[kind];
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown>>(spec.blank);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  /* trocar de separador fecha o que estiver aberto: o formulário é de outro
     tipo e os campos não têm nada a ver uns com os outros */
  function trocar(proximo: DocKind) {
    if (dirty && !confirm('Há alterações por salvar. Sair mesmo assim?')) return;
    setKind(proximo);
    setOpenId(null);
    setDirty(false);
    setMsg(null);
  }

  function open(row: DocRow) {
    setOpenId(row.id);
    setData({ ...spec.blank, ...row.data });
    setDirty(false);
    setMsg(null);
  }

  function novo() {
    start(async () => {
      const r = await createDoc(kind);
      if (r.error || !r.id) return setMsg(r.error ?? 'Erro.');
      setOpenId(r.id);
      setData({ ...spec.blank, date: new Date().toISOString().slice(0, 10) });
      setDirty(false);
      router.refresh();
    });
  }

  function change(path: string, value: unknown) {
    setData((d) => setIn(d, path, value));
    setDirty(true);
    setMsg(null);
  }

  function save() {
    if (!openId) return;
    start(async () => {
      const r = await saveDoc(openId, kind, data);
      setMsg(r.error ?? 'Salvo.');
      if (!r.error) setDirty(false);
      router.refresh();
    });
  }

  function drop(row: DocRow) {
    if (!confirm(`Apagar "${row.title}"?`)) return;
    start(async () => {
      await removeDoc(row.id);
      if (openId === row.id) setOpenId(null);
      router.refresh();
    });
  }

  return (
    <>
      <Busy on={pending} />
      <div className="dashBar noPrint">
        <h1>Documentos</h1>
        <span className="dashState" data-tone={dirty ? 'dirty' : undefined}>
          {pending ? <Spinner label="Salvando" /> : null}
          {pending
            ? 'Processando'
            : msg ?? (dirty ? 'Alterações por salvar' : `${rows.length} salvos`)}
        </span>
        {openId ? (
          <>
            <button
              type="button"
              className="btn quiet"
              onClick={() => setOpenId(null)}
            >
              Fechar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.print()}
              disabled={dirty}
              title={
                dirty
                  ? 'Salva antes de imprimir.'
                  : 'Na janela que abre, desliga «Cabeçalhos e rodapés» para a folha sair sem margens.'
              }
            >
              Imprimir / PDF
            </button>
            <button
              type="button"
              className="btn solid"
              onClick={save}
              disabled={pending || !dirty}
            >
              salvar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn solid"
            onClick={novo}
            disabled={pending}
          >
            {spec.novo}
          </button>
        )}
      </div>

      <div className="docTabs noPrint">
        <Segmented
          label="Tipo de documento"
          value={kind}
          onChange={trocar}
          options={DOC_ORDER.map((k) => ({ id: k, label: DOCS[k].label }))}
        />
      </div>

      {kind !== 'proposal' ? (
        <p className="aviso noPrint">
          Este modelo é um ponto de partida, não é parecer jurídico. Antes de
          assinar com uma marca, mostra-o a um advogado.
        </p>
      ) : null}

      {!openId ? (
        rows.length === 0 ? (
          <p className="libEmpty noPrint">{spec.vazio}</p>
        ) : (
          <div className="tblWrap noPrint">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{spec.one}</th>
                  <th>Atualizado</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-l={spec.one}>
                      <strong>{r.title}</strong>
                    </td>
                    <td data-l="Atualizado">{r.updated_at.slice(0, 10)}</td>
                    <td className="acts">
                      <button
                        type="button"
                        className="btn tiny quiet"
                        onClick={() => open(r)}
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        className="icoBtn"
                        aria-label="Apagar"
                        onClick={() => drop(r)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="docSplit">
          <div className="docForm noPrint">
            <Fields
              fields={spec.fields}
              ctx={{ root: data, base: '', onChange: change }}
            />
          </div>
          <div className="docPaper">
            <DocumentView doc={spec.render(data, author)} author={author} />
          </div>
        </div>
      )}
    </>
  );
}
