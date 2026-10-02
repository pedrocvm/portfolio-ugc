'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  moveContentCard,
  removeContentCard,
  saveContentCard,
} from '@/app/dashboard/content-manager-actions';
import { useBoardDrag } from '@/components/dashboard/useBoardDrag';
import {
  CONTENT_PILLARS,
  CONTENT_STAGES,
  STAGE_KEYS,
  pillarLabel,
  stageLabel,
  type ContentBoardItem,
  type ContentPillar,
  type ContentStage,
} from '@/modules/content-board/domain';

type View = 'week' | 'day';

const pad = (n: number) => String(n).padStart(2, '0');

const fromIso = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const addDays = (value: string, days: number) => {
  const date = fromIso(value);
  date.setDate(date.getDate() + days);
  return toIso(date);
};

const weekStart = (value: string) => {
  const date = fromIso(value);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return toIso(date);
};

const formatDay = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-PT', options ?? { weekday: 'short', day: '2-digit' }).format(
    fromIso(value),
  );

const scriptPreview = (script: string) => {
  const clean = script.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Roteiro ainda não escrito';
  return clean.length > 150 ? `${clean.slice(0, 150)}…` : clean;
};

function href(view: View, date: string) {
  return `/dashboard/content?view=${view}&date=${date}`;
}

function ContentCard({
  item,
  compact = false,
  onOpen,
  drag,
}: {
  item: ContentBoardItem;
  compact?: boolean;
  onOpen: () => void;
  drag?: ReturnType<typeof useBoardDrag>;
}) {
  return (
    <article
      className="cmCard"
      data-pillar={item.pillar}
      data-compact={compact || undefined}
    >
      <button className="cmCardBody" type="button" onClick={onOpen}>
        <span className="cmCardMeta">
          <span>{pillarLabel(item.pillar)}</span>
          {item.format ? <span>{item.format}</span> : <span>Formato por definir</span>}
        </span>
        <strong>{item.subject}</strong>
        {!compact ? <p>{scriptPreview(item.script)}</p> : null}
        <span className="cmCardStage">{stageLabel(item.stage)}</span>
      </button>

      {drag ? (
        <button
          className="cmGrip"
          type="button"
          aria-label={`Mover ${item.subject}`}
          onPointerDown={(event) => drag.onPointerDown(event, item.id)}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.cancel}
        >
          <i />
          <i />
          <i />
        </button>
      ) : null}
    </article>
  );
}

function Editor({
  item,
  date,
  onClose,
  onSaved,
}: {
  item: ContentBoardItem | null;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pillar, setPillar] = useState<ContentPillar>(item?.pillar ?? 'ugc_income');
  const [format, setFormat] = useState(item?.format ?? '');
  const [subject, setSubject] = useState(item?.subject ?? '');
  const [script, setScript] = useState(item?.script ?? '');
  const [scheduledFor, setScheduledFor] = useState(item?.scheduledFor ?? date);
  const [stage, setStage] = useState<ContentStage>(item?.stage ?? 'idea');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError('');
    startTransition(() => {
      void saveContentCard({
        id: item?.id,
        pillar,
        format,
        subject,
        script,
        scheduledFor,
        stage,
      }).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved();
      });
    });
  };

  const remove = () => {
    if (!item) return;
    setError('');
    startTransition(() => {
      void removeContentCard(item.id).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved();
      });
    });
  };

  return (
    <div className="cmOverlay" role="presentation" onMouseDown={onClose}>
      <section
        className="cmEditor"
        role="dialog"
        aria-modal="true"
        aria-label={item ? 'Editar conteúdo' : 'Novo conteúdo'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cmEditorHead">
          <div>
            <span className="cmEyebrow">{item ? 'Editar conteúdo' : 'Novo conteúdo'}</span>
            <h2>{item?.subject || 'Planejar peça'}</h2>
          </div>
          <button type="button" className="cmClose" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="cmForm">
          <label>
            <span>Pilar</span>
            <select value={pillar} onChange={(event) => setPillar(event.target.value as ContentPillar)}>
              {CONTENT_PILLARS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Formato</span>
            <input
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              placeholder="Reel, carrossel, story..."
            />
          </label>

          <label className="cmWide">
            <span>Assunto</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Sobre o que este conteúdo vai falar"
              autoFocus
            />
          </label>

          <label className="cmWide">
            <span>Roteiro</span>
            <textarea
              value={script}
              onChange={(event) => setScript(event.target.value)}
              placeholder="A Carol escreve o roteiro aqui."
              rows={14}
            />
          </label>

          <label>
            <span>Data</span>
            <input
              type="date"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </label>

          <label>
            <span>Etapa</span>
            <select value={stage} onChange={(event) => setStage(event.target.value as ContentStage)}>
              {CONTENT_STAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="cmError">{error}</p> : null}

        <footer className="cmEditorActions">
          {item ? (
            <button className="cmDelete" type="button" disabled={pending} onClick={remove}>
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div>
            <button type="button" className="cmGhostBtn" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="cmPrimary" disabled={pending || !subject.trim()} onClick={save}>
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default function ContentManager({
  items,
  view,
  selectedDate,
}: {
  items: ContentBoardItem[];
  view: View;
  selectedDate: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ContentBoardItem | null | undefined>(undefined);
  const [moveError, setMoveError] = useState('');
  const [moving, startMove] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);

  const start = weekStart(selectedDate);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(start, index)),
    [start],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, ContentBoardItem[]>();
    for (const item of items) {
      const group = map.get(item.scheduledFor) ?? [];
      group.push(item);
      map.set(item.scheduledFor, group);
    }
    return map;
  }, [items]);

  const drag = useBoardDrag(
    (id, zone) => {
      if (!STAGE_KEYS.includes(zone as ContentStage)) return;
      const item = items.find((row) => row.id === id);
      if (!item || item.stage === zone) return;

      setMoveError('');
      startMove(() => {
        void moveContentCard({ id, stage: zone }).then((result) => {
          if (!result.ok) setMoveError(result.error);
          router.refresh();
        });
      });
    },
    boardRef,
  );

  const openNew = () => setEditing(null);
  const closeEditor = () => setEditing(undefined);
  const saved = () => {
    closeEditor();
    router.refresh();
  };

  const previousDate = view === 'week' ? addDays(start, -7) : addDays(selectedDate, -1);
  const nextDate = view === 'week' ? addDays(start, 7) : addDays(selectedDate, 1);

  return (
    <div className="cm">
      <header className="cmTop">
        <div>
          <span className="cmEyebrow">Gerenciador de conteúdo</span>
          <h1>{view === 'week' ? 'Semana editorial' : formatDay(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        </div>

        <button type="button" className="cmPrimary" onClick={openNew}>
          Novo conteúdo
        </button>
      </header>

      <div className="cmToolbar">
        <div className="cmViewSwitch" aria-label="Visualização">
          <Link href={href('week', selectedDate)} aria-current={view === 'week' ? 'page' : undefined}>
            Semana
          </Link>
          <Link href={href('day', selectedDate)} aria-current={view === 'day' ? 'page' : undefined}>
            Dia
          </Link>
        </div>

        <div className="cmDateNav">
          <Link href={href(view, previousDate)} aria-label="Anterior">‹</Link>
          <Link className="cmToday" href={href(view, toIso(new Date()))}>Hoje</Link>
          <Link href={href(view, nextDate)} aria-label="Próximo">›</Link>
        </div>
      </div>

      {view === 'week' ? (
        <div className="cmCalendar">
          {days.map((day) => {
            const dayItems = byDate.get(day) ?? [];
            const isSelected = day === selectedDate;
            return (
              <section className="cmDay" key={day} data-selected={isSelected || undefined}>
                <Link className="cmDayHead" href={href('day', day)}>
                  <span>{formatDay(day, { weekday: 'short' })}</span>
                  <strong>{formatDay(day, { day: '2-digit' })}</strong>
                </Link>

                <div className="cmDayCards">
                  {dayItems.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      compact
                      onOpen={() => setEditing(item)}
                    />
                  ))}

                  {!dayItems.length ? (
                    <button className="cmEmptyDay" type="button" onClick={() => {
                      router.push(href('week', day));
                      setEditing(null);
                    }}>
                      + adicionar
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {moveError ? <p className="cmError">{moveError}</p> : null}
          <div className="cmBoard" ref={boardRef} data-moving={moving || undefined}>
            {CONTENT_STAGES.map((column) => {
              const rows = items.filter((item) => item.stage === column.value);
              return (
                <section
                  className="cmColumn"
                  key={column.value}
                  data-zone={column.value}
                  data-over={drag.zone === column.value || undefined}
                >
                  <header className="cmColumnHead">
                    <div>
                      <h2>{column.label}</h2>
                      <p>{column.description}</p>
                    </div>
                    <span>{rows.length}</span>
                  </header>

                  <div className="cmColumnCards">
                    {rows.map((item) => (
                      <ContentCard
                        key={item.id}
                        item={item}
                        onOpen={() => setEditing(item)}
                        drag={drag}
                      />
                    ))}
                    {!rows.length ? <p className="cmColumnEmpty">Solte um card aqui</p> : null}
                  </div>
                </section>
              );
            })}
          </div>

          {drag.held ? (
            <div
              className="cmDragGhost"
              ref={drag.ghost}
              style={{ width: Math.max(drag.held.w, 260), height: Math.max(drag.held.h, 120) }}
              aria-hidden="true"
            >
              {items.find((item) => item.id === drag.held?.id)?.subject ?? 'Conteúdo'}
            </div>
          ) : null}
        </>
      )}

      {editing !== undefined ? (
        <Editor
          key={editing?.id ?? `new-${selectedDate}`}
          item={editing}
          date={selectedDate}
          onClose={closeEditor}
          onSaved={saved}
        />
      ) : null}
    </div>
  );
}
