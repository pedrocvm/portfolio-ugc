'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from '@/components/dashboard/Toasts';
import {
  addBrollTake,
  bragaEpisode,
  bragaPlaceDone,
  craftPiece,
  englishPiece,
  findBragaPlaces,
  fixBrollTags,
  proofToContent,
  saveProof,
  setProofPermission,
} from '@/app/dashboard/content-actions';
import type { BragaSeries, BrollRow, SocialProofRow } from '@/modules/creator/content-os-service';
import type { ContentIdeaRow } from '@/modules/creator/plan-service';
import { useCaptureUpload } from './useCaptureUpload';

/** O Banco: ideias salvas, os takes de B-roll, as séries e a prova social.
 *
 *  Nada aqui é para manter à mão. Um take entra por arquivo ou por uma frase e
 *  as etiquetas nascem sozinhas; um feedback entra colado; a série guarda os
 *  lugares que o sistema encontrou. Ela corrige quando for preciso. */

const PERMISSAO: Record<SocialProofRow['permission'], string> = {
  unknown: 'sem permissão',
  requested: 'permissão pedida',
  granted: 'pode usar',
  denied: 'não usar',
};

export default function ContentVault({
  saved,
  seeds,
  broll,
  braga,
  proof,
}: {
  saved: ContentIdeaRow[];
  seeds: ContentIdeaRow[];
  broll: BrollRow[];
  braga: BragaSeries | null;
  proof: SocialProofRow[];
}) {
  return (
    <>
      <section className="osSection">
        <h2>
          Ideias salvas <span className="osCount">{saved.length}</span>
        </h2>
        {saved.length ? (
          <div className="osRows">
            {saved.map((i) => (
              <div className="osRow" key={i.id}>
                <div>
                  <span className="osRowName">{i.title || i.hook}</span>
                  <p className="osRowSub">
                    {i.pillarLabel}
                    {i.functionLabel ? ` · ${i.functionLabel}` : ''}
                    {i.track !== 'main' ? ` · ${i.trackLabel}` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <Link className="chip" href={`/dashboard/content?idea=${i.id}`}>Ver plano</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osRowSub">Nada salvo para depois.</p>
        )}
        {seeds.length ? (
          <details className="osRest">
            <summary>
              Matéria-prima da auditoria <b>{seeds.length}</b>
            </summary>
            <div className="osRows">
              {seeds.map((s) => (
                <div className="osRow" key={s.id}>
                  <div>
                    <span className="osRowName">{s.title}</span>
                    <p className="osRowSub">«{s.hook}» · {s.pillarLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <BrollBank broll={broll} />
      <Series braga={braga} />
      <ProofVault proof={proof} />
    </>
  );
}

/* ── B-roll ───────────────────────────────────────────────────────────────── */

function BrollBank({ broll }: { broll: BrollRow[] }) {
  const { upload, busy, error: upErr } = useCaptureUpload('broll');
  const [pending, start] = useTransition();
  const [nota, setNota] = useState('');
  const [segundos, setSegundos] = useState('');
  const [erro, setErro] = useState('');
  const [novos, setNovos] = useState<{ id: string; title: string; tags: string[] }[]>([]);

  const registar = (file?: File) =>
    start(async () => {
      setErro('');
      let up: { path: string; name: string } | null = null;
      if (file) {
        up = await upload(file);
        if (!up) return;
      }
      const r = await addBrollTake({ path: up?.path ?? null, fileName: up?.name ?? null, note: nota.trim(), durationSeconds: segundos ? Number(segundos) : null }).catch(
        (): { error: string } => ({ error: 'Não consegui registar agora.' }),
      );
      if ('error' in r) {
        setErro(r.error);
        return;
      }
      setNovos((v) => [{ id: r.id, title: nota.trim() || up?.name || 'take', tags: r.tags }, ...v]);
      setNota('');
      setSegundos('');
      pushToast(r.tags.length ? `Take registado: ${r.tags.join(', ')}.` : 'Take registado.');
    });

  const lista = [...novos.map((n) => ({ ...n, durationSeconds: null as number | null, usedCount: 0 })), ...broll];

  return (
    <section className="osSection">
      <h2>
        B-roll <span className="osCount">{lista.length}</span>
      </h2>
      <p className="osNote">
        A pasta de takes do cotidiano — editando, café, casa, academia. É daqui que o Reels Test sai sem gravar nada novo. Suba o arquivo ou só diga o que é: as etiquetas nascem sozinhas.
      </p>

      <div className="csAdd">
        <input
          className="osSearch"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="O que é o take: «eu editando no CapCut, uns 8 segundos»"
          aria-label="O que é o take"
        />
        <input
          className="osSearch csSeconds"
          value={segundos}
          onChange={(e) => setSegundos(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="seg"
          inputMode="numeric"
          aria-label="Segundos"
        />
        <label className="osPageBtn">
          {busy ? <Spinner label="Subindo" /> : null}
          Subir arquivo
          <input type="file" accept="image/*,video/*" hidden onChange={(e) => registar(e.target.files?.[0] ?? undefined)} />
        </label>
        <button className="osPageBtn" type="button" disabled={pending || !nota.trim()} onClick={() => registar()}>
          {pending ? <Spinner label="Registando" /> : null}
          Registar só a descrição
        </button>
      </div>
      {erro || upErr ? <p className="osWarn" role="alert">{erro || upErr}</p> : null}

      {lista.length ? (
        <div className="osRows">
          {lista.map((b) => (
            <BrollRowView key={b.id} id={b.id} title={b.title} tags={b.tags} durationSeconds={b.durationSeconds ?? null} usedCount={b.usedCount} />
          ))}
        </div>
      ) : (
        <p className="osRowSub">Ainda sem takes. Cada teste vai pedir uma gravação curta até haver banco.</p>
      )}
    </section>
  );
}

function BrollRowView({ id, title, tags, durationSeconds, usedCount }: { id: string; title: string; tags: readonly string[]; durationSeconds: number | null; usedCount: number }) {
  const [edit, setEdit] = useState(false);
  const [texto, setTexto] = useState(tags.join(', '));
  const [pending, start] = useTransition();

  const salvar = () =>
    start(async () => {
      await fixBrollTags(id, texto.split(',').map((t) => t.trim()).filter(Boolean));
      setEdit(false);
    });

  return (
    <div className="osRow">
      <div>
        <span className="osRowName" style={{ fontSize: 17 }}>{title}</span>
        {edit ? (
          <input className="osSearch" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Etiquetas, separadas por vírgula" />
        ) : (
          <p className="osRowSub">
            {texto || 'sem etiquetas'}
            {durationSeconds ? ` · ${durationSeconds}s` : ''}
            {usedCount ? ` · usado ${usedCount}×` : ''}
          </p>
        )}
      </div>
      <div className="osRowSide">
        {edit ? (
          <button className="osPageBtn" type="button" disabled={pending} onClick={salvar}>Pronto</button>
        ) : (
          <button className="focusSkip" type="button" onClick={() => setEdit(true)}>Corrigir etiquetas</button>
        )}
      </div>
    </div>
  );
}

/* ── Séries ───────────────────────────────────────────────────────────────── */

function Series({ braga }: { braga: BragaSeries | null }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');

  const procurar = () =>
    start(async () => {
      setErro('');
      const r = await findBragaPlaces().catch((): { error: string } => ({ error: 'Não consegui procurar agora.' }));
      if ('error' in r) setErro(r.error);
      else pushToast(r.added ? `Encontrei ${r.added} ${r.added === 1 ? 'lugar' : 'lugares'}.` : 'Nada novo em Braga desta vez.');
    });

  const episodio = (place?: string) =>
    start(async () => {
      setErro('');
      const r = await bragaEpisode(place).catch(() => ({ error: 'Não consegui escrever o episódio agora.' }));
      if (r.error) setErro(r.error);
      else pushToast('Episódio escrito. Está em «Para gravar».');
    });

  const outra = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn().catch(() => ({ error: 'Não consegui escrever agora.' }));
      if (r.error) setErro(r.error);
      else pushToast(ok);
    });

  return (
    <section className="osSection">
      <h2>Séries e experiências</h2>
      {braga ? (
        <div className="osPanel">
          <h3>{braga.name}</h3>
          <p className="osNote">{braga.premise}</p>
          {braga.places.length ? (
            <div className="osRows">
              {braga.places.map((p) => (
                <div className="osRow" key={p.name}>
                  <div>
                    <span className="osRowName" style={{ fontSize: 17 }}>{p.name}</span>
                    <p className="osRowSub">{p.kind} · {p.angle || p.why}</p>
                  </div>
                  <div className="osRowSide">
                    {p.published ? (
                      <span className="osTag" data-tone="ok">publicado</span>
                    ) : p.ideaId ? (
                      <Link className="chip" href={`/dashboard/content?idea=${p.ideaId}`}>Ver episódio</Link>
                    ) : (
                      <button className="osPageBtn" type="button" disabled={pending} onClick={() => episodio(p.name)}>Fazer episódio</button>
                    )}
                    {!p.visited ? (
                      <button className="focusSkip" type="button" disabled={pending} onClick={() => start(async () => { await bragaPlaceDone(p.name, { visited: true }); })}>Já fui</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="osRowSub">Ainda sem lugares na lista.</p>
          )}
          <footer className="osCardActs">
            <button className="osPageBtn" type="button" disabled={pending} onClick={procurar}>
              {pending ? <Spinner label="Procurando" /> : null}
              Procurar lugares em Braga
            </button>
            <button className="osPageBtn" type="button" disabled={pending} onClick={() => episodio()}>Escrever um episódio</button>
          </footer>
        </div>
      ) : null}

      <div className="osPanel">
        <h3>Experiências</h3>
        <p className="osNote">Cada uma é uma peça pedida à mão, pelos mesmos portões do plano do dia. O que se mede fica em «Publicado».</p>
        <footer className="osCardActs">
          <button className="osPageBtn" type="button" disabled={pending} onClick={() => outra(englishPiece, 'Peça em inglês escrita. Está em «Para gravar».')}>Uma peça em inglês</button>
          <button className="osPageBtn" type="button" disabled={pending} onClick={() => outra(craftPiece, 'Bastidor de edição escrito. Está em «Para gravar».')}>Um bastidor de edição</button>
        </footer>
      </div>
      {erro ? <p className="osWarn" role="alert">{erro}</p> : null}
    </section>
  );
}

/* ── Prova social ─────────────────────────────────────────────────────────── */

function ProofVault({ proof }: { proof: SocialProofRow[] }) {
  const [pending, start] = useTransition();
  const [marca, setMarca] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [permissoes, setPermissoes] = useState<Record<string, SocialProofRow['permission']>>({});

  const guardarFeedback = () =>
    start(async () => {
      setErro('');
      const r = await saveProof({ brandName: marca, feedback: texto }).catch(() => ({ error: 'Não consegui salvar agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      setMarca('');
      setTexto('');
      pushToast('Feedback salvo. Falta a permissão da marca para usar.');
    });

  const permissao = (id: string, p: SocialProofRow['permission']) =>
    start(async () => {
      setPermissoes((v) => ({ ...v, [id]: p }));
      await setProofPermission(id, p);
    });

  const preparar = (id: string) =>
    start(async () => {
      setErro('');
      const r = await proofToContent(id).catch(() => ({ error: 'Não consegui preparar agora.' }));
      if (r.error) setErro(r.error);
      else pushToast('Conteúdo preparado. Está em «Para gravar».');
    });

  return (
    <section className="osSection">
      <h2>
        Feedback de marcas <span className="osCount">{proof.length}</span>
      </h2>
      <p className="osNote">
        O que uma marca disse do trabalho dela é prova social. Vira conteúdo e portfólio — depois de a marca autorizar. Sem permissão registada, o sistema mostra o processo e não cita ninguém.
      </p>
      <div className="csAdd">
        <input className="osSearch" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca" aria-label="Marca" />
        <input className="osSearch" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que a marca disse" aria-label="O que a marca disse" />
        <button className="osPageBtn" type="button" disabled={pending || !marca.trim() || !texto.trim()} onClick={guardarFeedback}>
          {pending ? <Spinner label="Salvando" /> : null}
          Salvar feedback
        </button>
      </div>
      {erro ? <p className="osWarn" role="alert">{erro}</p> : null}
      {proof.length ? (
        <div className="osRows">
          {proof.map((p) => {
            const perm = permissoes[p.id] ?? p.permission;
            return (
              <div className="osRow" key={p.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{p.brandName}</span>
                  <p className="osRowSub">{p.feedback || p.context}</p>
                  {p.feedback && p.context ? <p className="osRowSub">{p.context}</p> : null}
                </div>
                <div className="osRowSide">
                  <select
                    className="osSearch"
                    value={perm}
                    onChange={(e) => permissao(p.id, e.target.value as SocialProofRow['permission'])}
                    aria-label="Permissão da marca"
                  >
                    {(Object.keys(PERMISSAO) as SocialProofRow['permission'][]).map((k) => (
                      <option key={k} value={k}>{PERMISSAO[k]}</option>
                    ))}
                  </select>
                  {p.contentIdeaId ? (
                    <Link className="chip" href={`/dashboard/content?idea=${p.contentIdeaId}`}>Ver conteúdo</Link>
                  ) : (
                    <button className="osPageBtn" type="button" disabled={pending} onClick={() => preparar(p.id)}>Preparar conteúdo</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
