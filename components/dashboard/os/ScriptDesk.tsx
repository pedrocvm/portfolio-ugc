'use client';

import { useState, useTransition } from 'react';
import { buildShotList, saveContentAsset, scriptApproved } from '@/app/dashboard/carolos-actions';
import { label } from '@/lib/labels';
import { CAPABILITIES, CAPABILITY_LABEL, FUNNEL_LABEL, FUNNEL_NOTE, type ContentRow, type FunnelRole } from '@/modules/content/domain';

/** Roteiro e shot list.
 *
 *  A shot list é o que evita descobrir a tomada em falta depois de o produto
 *  já ter voltado para a caixa. Sai do guião, uma linha por cena, e as
 *  obrigatórias — as que o briefing exige — ficam marcadas. */

const ROLES: FunnelRole[] = ['DISCOVERY', 'CONSIDERATION', 'DECISION'];

export default function ScriptDesk({
  collaborationId, brandId, content,
}: {
  collaborationId: string;
  brandId: string;
  content: ContentRow[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<FunnelRole>('CONSIDERATION');
  const [hook, setHook] = useState('');
  const [message, setMessage] = useState('');
  const [caps, setCaps] = useState<string[]>([]);
  const [error, setError] = useState('');

  return (
    <div className="osPanel">
      <h3>Conteúdo e shot list</h3>
      <p className="osNote">
        Cada peça é uma hipótese com uma função no funil, não um arquivo. É isso que permite vender
        um pacote por cobertura de mensagem em vez de por desconto.
      </p>

      {content.length ? (
        <div className="osRows">
          {content.map((c) => (
            <ContentItem key={c.id} item={c} collaborationId={collaborationId} />
          ))}
        </div>
      ) : (
        <p className="osRowSub">Ainda não há conteúdo planeado para esta colaboração.</p>
      )}

      <div className="osActs">
        <button className="chip" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Fechar' : 'Planear uma peça'}
        </button>
      </div>

      {open ? (
        <>
          <div className="osInline" style={{ marginTop: 14 }}>
            <label className="osField">
              <span>Título</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="osField">
              <span>Função no funil</span>
              <select value={role} onChange={(e) => setRole(e.target.value as FunnelRole)}>
                {ROLES.map((r) => <option key={r} value={r}>{FUNNEL_LABEL[r]}</option>)}
              </select>
            </label>
          </div>
          <p className="osRowSub">{FUNNEL_NOTE[role]}</p>

          <label className="osField">
            <span>Gancho</span>
            <input type="text" value={hook} onChange={(e) => setHook(e.target.value)} />
          </label>
          <label className="osField">
            <span>Mensagem central</span>
            <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          <label className="osField">
            <span>Competências que esta peça demonstra</span>
            <div className="osKinds">
              {CAPABILITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={caps.includes(c)}
                  onClick={() => setCaps((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]))}
                >
                  {CAPABILITY_LABEL[c] ?? c}
                </button>
              ))}
            </div>
          </label>

          <div className="osActs">
            <button
              className="btn"
              type="button"
              disabled={pending || !title.trim()}
              onClick={() =>
                start(async () => {
                  setError('');
                  const result = await saveContentAsset({
                    collaborationId,
                    brandId,
                    title,
                    funnelRole: role,
                    hook,
                    coreMessage: message,
                    capabilities: caps,
                  });
                  if (result.error) return setError(result.error);
                  setTitle('');
                  setHook('');
                  setMessage('');
                  setCaps([]);
                  setOpen(false);
                })
              }
            >
              Salvar peça
            </button>
          </div>
          {error ? <p className="osWarn" role="alert">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function ContentItem({ item, collaborationId }: { item: ContentRow; collaborationId: string }) {
  const [pending, start] = useTransition();
  const [script, setScript] = useState(item.script);
  const [mandatory, setMandatory] = useState('');
  const [shots, setShots] = useState(item.shotList);

  return (
    <div className="osRow">
      <div style={{ width: '100%' }}>
        <span className="osRowName" style={{ fontSize: 17 }}>{item.title}</span>
        <p className="osRowSub">
          {item.funnelRole ? FUNNEL_LABEL[item.funnelRole] : '—'}
          {item.hook ? ` · ${item.hook}` : ''}
        </p>
        {item.capabilities.length ? (
          <div className="osMeta">
            {item.capabilities.map((c) => (
              <span key={c} className="osTag" data-tone="mute">{CAPABILITY_LABEL[c] ?? c}</span>
            ))}
          </div>
        ) : null}

        <details className="osEvidence" style={{ marginTop: 10 }}>
          <summary>Roteiro e shot list</summary>

          <label className="osField" style={{ marginTop: 12 }}>
            <span>Roteiro — uma cena por linha</span>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={8} />
          </label>

          <label className="osField">
            <span>Palavras que marcam uma tomada obrigatória</span>
            <input
              type="text"
              value={mandatory}
              onChange={(e) => setMandatory(e.target.value)}
              placeholder="logótipo, embalagem, tela"
            />
          </label>

          <div className="osActs">
            <button
              className="chip"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await saveContentAsset({ id: item.id, title: item.title, script });
                  await buildShotList(
                    item.id,
                    script,
                    mandatory.split(',').map((s) => s.trim()).filter(Boolean),
                  );
                  setShots(
                    script
                      .split('\n')
                      .map((l) => l.trim())
                      .filter((l) => l.length > 3)
                      .map((l) => ({
                        shot: l.replace(/^[-*\d.)\s]+/, ''),
                        required: mandatory
                          .split(',')
                          .map((m) => m.trim())
                          .filter(Boolean)
                          .some((m) => l.toLowerCase().includes(m.toLowerCase())),
                      })),
                  );
                })
              }
            >
              Gerar shot list
            </button>
            {item.status !== 'script_approved' ? (
              <button
                className="chip"
                type="button"
                disabled={pending}
                onClick={() => start(() => scriptApproved(item.id, collaborationId).then(() => undefined))}
              >
                Roteiro aprovado
              </button>
            ) : null}
          </div>

          {shots.length ? (
            <ol className="osList" style={{ marginTop: 12 }}>
              {shots.map((s, i) => (
                <li key={`${i}-${s.shot.slice(0, 20)}`}>
                  {s.shot}
                  {s.required ? <> <span className="osTag" data-tone="hot">obrigatória</span></> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      </div>
      <div className="osRowSide">
        <span className="osTag" data-tone={item.status === 'approved' ? 'won' : 'mute'}>
          {label('contentStatus', item.status)}
        </span>
      </div>
    </div>
  );
}
