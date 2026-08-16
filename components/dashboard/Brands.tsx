'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import Busy from './Busy';
import Spinner from './Spinner';
import { removeBrand, saveBrand } from '@/app/dashboard/brand-actions';
import {
  CHANNELS,
  STAGES,
  channelLabel,
  stageLabel,
  type Brand,
} from '@/lib/brands';
import type { Result } from '@/app/dashboard/actions';

const hoje = () => new Date().toISOString().slice(0, 10);

export default function Brands({ brands }: { brands: Brand[] }) {
  const [editing, setEditing] = useState<Brand | 'nova' | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function drop(b: Brand) {
    if (!confirm(`Apagar a marca "${b.name}"?`)) return;
    start(async () => {
      await removeBrand(b.id);
      router.refresh();
    });
  }

  return (
    <>
      <Busy on={pending} />
      <div className="dashBar">
        <h1>Marcas</h1>
        <span className="dashState">
          {pending ? <Spinner label="A processar" /> : null}
          {pending ? 'A processar' : `${brands.length} registadas`}
        </span>
        <button
          type="button"
          className="btn solid"
          onClick={() => setEditing('nova')}
        >
          Registar marca
        </button>
      </div>

      {editing ? (
        <BrandForm
          key={editing === 'nova' ? 'nova' : editing.id}
          brand={editing === 'nova' ? null : editing}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {brands.length === 0 ? (
        <p className="libEmpty">
          Ainda não registaste nenhuma marca. Cada abordagem que fizeres entra
          aqui e aparece logo no funil.
        </p>
      ) : (
        <div className="tblWrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Contacto</th>
                <th>Abordada</th>
                <th>Etapa</th>
                <th>Próximo passo</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id}>
                  <td data-l="Marca">
                    <strong>{b.name}</strong>
                    {b.instagram ? (
                      <span className="sub">{b.instagram}</span>
                    ) : null}
                  </td>
                  <td data-l="Contacto">
                    {b.contact || '—'}
                    <span className="sub">{channelLabel(b.channel)}</span>
                  </td>
                  <td data-l="Abordada">{b.approached_on ?? '—'}</td>
                  <td data-l="Etapa">
                    <span className="pill" data-stage={b.stage}>
                      {stageLabel(b.stage)}
                    </span>
                  </td>
                  <td data-l="Próximo passo">{b.next_step || '—'}</td>
                  <td className="acts">
                    <button
                      type="button"
                      className="btn tiny quiet"
                      onClick={() => setEditing(b)}
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="icoBtn"
                      aria-label="Apagar"
                      onClick={() => drop(b)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BrandForm({
  brand,
  onDone,
}: {
  brand: Brand | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<Result, FormData>(
    saveBrand,
    {},
  );

  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  /* o formulário nasce no topo da página: sem isto, quem clica "Abrir" numa
     marca do fundo da lista não vê nada acontecer */
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <form action={action} className="brandForm" ref={box}>
      <input type="hidden" name="id" defaultValue={brand?.id ?? ''} />
      <div className="flds two">
        <div className="fld">
          <label>
            Nome da marca
            <input type="text" name="name" defaultValue={brand?.name} required />
          </label>
        </div>
        <div className="fld">
          <label>
            Instagram
            <input
              type="text"
              name="instagram"
              defaultValue={brand?.instagram}
              placeholder="@marca"
            />
          </label>
        </div>
        <div className="fld">
          <label>
            Contacto
            <input
              type="text"
              name="contact"
              defaultValue={brand?.contact}
              placeholder="E-mail, telemóvel ou nome de quem responde"
            />
          </label>
        </div>
        <div className="fld">
          <label>
            Canal do contacto
            <select name="channel" defaultValue={brand?.channel ?? 'instagram'}>
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="fld">
          <label>
            Data da abordagem
            <input
              type="date"
              name="approached_on"
              defaultValue={brand?.approached_on ?? hoje()}
            />
          </label>
        </div>
        <div className="fld">
          <label>
            Etapa
            <select name="stage" defaultValue={brand?.stage ?? 'abordada'}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="fld wide">
          <label>
            Próximo passo
            <input
              type="text"
              name="next_step"
              defaultValue={brand?.next_step}
              placeholder="O que tens de fazer a seguir, e quando"
            />
          </label>
        </div>
        <div className="fld wide">
          <label>
            Notas
            <textarea name="notes" defaultValue={brand?.notes} />
          </label>
        </div>
      </div>
      {state.error ? <p className="loginErr">{state.error}</p> : null}
      <div className="mediaRow">
        <button className="btn solid" type="submit" disabled={pending}>
          {pending ? 'A guardar…' : 'Guardar'}
        </button>
        <button type="button" className="btn quiet" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
