'use client';

import { useState } from 'react';
import type { Field } from '@/lib/schema';
import { isVideo } from '@/lib/media';
import MediaField from './MediaField';
import { getIn, join, setIn } from './paths';

type Ctx = {
  root: unknown;
  base: string;
  onChange: (path: string, value: unknown) => void;
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function Fields({ fields, ctx }: { fields: Field[]; ctx: Ctx }) {
  return (
    <div className="flds two">
      {fields.map((f) => (
        <One key={f.path} f={f} ctx={ctx} />
      ))}
    </div>
  );
}

function One({ f, ctx }: { f: Field; ctx: Ctx }) {
  const path = join(ctx.base, f.path);
  const value = getIn(ctx.root, path);
  const set = (v: unknown) => ctx.onChange(path, v);

  if (f.k === 'text') {
    return (
      <div className="fld">
        <label>
          {f.label}
          <input
            type="text"
            value={str(value)}
            onChange={(e) => set(e.target.value)}
          />
        </label>
        {f.hint ? <p className="hint">{f.hint}</p> : null}
      </div>
    );
  }

  if (f.k === 'area') {
    return (
      <div className="fld wide">
        <label>
          {f.label}
          <textarea
            value={str(value)}
            onChange={(e) => set(e.target.value)}
          />
        </label>
        {f.hint ? <p className="hint">{f.hint}</p> : null}
      </div>
    );
  }

  if (f.k === 'bool') {
    return (
      <div className="fld">
        <label className="chk">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => set(e.target.checked)}
          />
          {f.label}
        </label>
        {f.hint ? <p className="hint">{f.hint}</p> : null}
      </div>
    );
  }

  if (f.k === 'image') {
    return (
      <MediaField
        kind="image"
        label={f.label}
        hint={f.hint}
        value={str(value)}
        onChange={set}
      />
    );
  }

  if (f.k === 'video') {
    const v = (value ?? {}) as { src?: string; srcSm?: string };
    return (
      <>
        <MediaField
          kind="video"
          label={f.label}
          hint={f.hint}
          value={str(v.src)}
          onChange={(next) => set({ ...v, src: next })}
        />
        <MediaField
          kind="video"
          label={`${f.label} · versão para telemóvel`}
          hint="Opcional. Sem isto, o telemóvel usa o vídeo de cima."
          value={str(v.srcSm)}
          onChange={(next) => set({ ...v, srcSm: next })}
        />
      </>
    );
  }

  if (f.k === 'media') {
    return (
      <MediaField
        kind="media"
        label={f.label}
        hint={f.hint}
        value={str(value)}
        onChange={set}
      />
    );
  }

  if (f.k === 'strings') {
    const items = Array.isArray(value) ? (value as string[]) : [];
    const write = (next: string[]) => set(next);
    return (
      <div className="fld wide">
        <span className="lb">{f.label}</span>
        <div className="list">
          {items.map((it, i) => (
            <div className="strRow" key={i}>
              <input
                type="text"
                value={str(it)}
                onChange={(e) =>
                  write(items.map((v, k) => (k === i ? e.target.value : v)))
                }
              />
              {f.fixed ? null : (
                <button
                  type="button"
                  className="icoBtn"
                  aria-label="Remover"
                  disabled={items.length < 2}
                  onClick={() => write(items.filter((_, k) => k !== i))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {f.fixed ? null : (
          <p className="mediaRow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn tiny"
              onClick={() => write([...items, ''])}
            >
              Adicionar
            </button>
          </p>
        )}
        {f.hint ? <p className="hint">{f.hint}</p> : null}
      </div>
    );
  }

  if (f.k !== 'list') return null;

  const items = Array.isArray(value) ? (value as unknown[]) : [];
  const write = (next: unknown[]) => set(next);
  const move = (i: number, dir: number) => {
    const to = i + dir;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[i], next[to]] = [next[to], next[i]];
    write(next);
  };

  return (
    <div className="fld wide">
      <span className="lb">{f.label}</span>
      <div className="list">
        {items.map((it, i) => (
          <Card
            key={i}
            index={i}
            total={items.length}
            title={`${f.title} ${String(i + 1).padStart(2, '0')}`}
            summary={summarise(it)}
            thumb={thumbOf(it)}
            onMove={(dir) => move(i, dir)}
            onDrop={(from) => {
              if (from === i) return;
              const next = [...items];
              const [moved] = next.splice(from, 1);
              next.splice(i, 0, moved);
              write(next);
            }}
            onRemove={() => write(items.filter((_, k) => k !== i))}
          >
            <Fields
              fields={f.item}
              ctx={{ ...ctx, base: `${path}.${i}` }}
            />
          </Card>
        ))}
      </div>
      <p className="mediaRow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn tiny"
          onClick={() =>
            write([...items, JSON.parse(JSON.stringify(f.blank))])
          }
        >
          Adicionar {f.title.toLowerCase()}
        </button>
      </p>
      {f.hint ? <p className="hint">{f.hint}</p> : null}
    </div>
  );
}

/** Sem isto, sete fotos são sete linhas iguais e ela não sabe qual está a
 *  apagar. O primeiro endereço de média do item serve de retrato. */
function thumbOf(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  for (const v of Object.values(item as Record<string, unknown>)) {
    if (typeof v === 'string' && /^(\/|https?:\/\/)/.test(v)) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const src = (v as { src?: unknown }).src;
      if (typeof src === 'string' && src) return src;
    }
  }
  return '';
}

function summarise(item: unknown) {
  if (!item || typeof item !== 'object') return '';
  for (const v of Object.values(item as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim() && !v.startsWith('/') && !v.startsWith('http')) {
      return v.length > 64 ? `${v.slice(0, 64)}…` : v;
    }
  }
  return '';
}

function Card({
  index,
  total,
  title,
  summary,
  thumb,
  onMove,
  onRemove,
  onDrop,
  children,
}: {
  index: number;
  total: number;
  title: string;
  summary: string;
  thumb: string;
  onMove: (dir: number) => void;
  onRemove: () => void;
  onDrop: (from: number) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <div
      className="card"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isNaN(from)) onDrop(from);
      }}
    >
      <div
        className="cardHead"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', String(index));
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <span className="grip" aria-hidden="true">
          <i />
          <i />
        </span>
        <button
          type="button"
          className="icoBtn"
          aria-label={open ? 'Fechar' : 'Abrir'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '−' : '+'}
        </button>
        {thumb ? (
          <span className="cardPic" aria-hidden="true">
            {isVideo(thumb) ? (
              <video src={thumb} muted playsInline preload="metadata" />
            ) : (
              <img src={thumb} alt="" loading="lazy" />
            )}
          </span>
        ) : null}
        <span className="n">{title}</span>
        <span className="t">{summary}</span>
        <button
          type="button"
          className="icoBtn mvUp"
          aria-label="Subir"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icoBtn mvDown"
          aria-label="Descer"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="icoBtn"
          aria-label="Remover"
          disabled={total < 2}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      <div className="cardWrap" data-open={open || undefined}>
        <div className="cardBody">{children}</div>
      </div>
    </div>
  );
}

export { setIn };
