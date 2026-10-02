'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addContentPillar,
  editContentPillar,
  moveContentCard,
  removeContentCard,
  saveContentCard,
} from '@/app/dashboard/content-manager-actions';
import { useBoardDrag } from '@/components/dashboard/useBoardDrag';
import {
  CONTENT_STAGES,
  STAGE_KEYS,
  stageLabel,
  type ContentBoardItem,
  type ContentPillar,
  type ContentStage,
} from '@/modules/content-board/domain';

type View = 'week' | 'day';

const PILLAR_ACCENTS = ['#7A1526', '#6B6947', '#A68B5B', '#A99482'] as const;

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

const href = (view: View, date: string) =>
  `/dashboard/content?view=${view}&date=${date}`;

function pillarAccent(pillarId: string, pillars: ContentPillar[]) {
  const index = Math.max(
    0,
    pillars.findIndex((pillar) => pillar.id === pillarId),
  );
  return PILLAR_ACCENTS[index % PILLAR_ACCENTS.length];
}

function ContentCard({
  item,
  accent,
  compact = false,
  onOpen,
  drag,
}: {
  item: ContentBoardItem;
  accent: string;
  compact?: boolean;
  onOpen: () => void;
  drag?: ReturnType<typeof useBoardDrag>;
}) {
  return (
    <article
      className="cmCard"
      data-compact={compact || undefined}
      style={{ '--pillar-accent': accent } as React.CSSProperties}
    >
      <button className="cmCardBody" type="button" onClick={onOpen}>
        <span className="cmCardMeta">
          <span>{item.pillarName}</span>
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
  pillars,
  onClose,
  onSaved,
}: {
  item: ContentBoardItem | null;
  date: string;
  pillars: ContentPillar[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pillarId, setPillarId] = useState(item?.pillarId || pillars[0]?.id || '');
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
        pillarId,
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
            <select value={pillarId} onChange={(event) => setPillarId(event.target.value)}>
              {pillars.map((pillar) => (
                <option key={pillar.id} value={pillar.id}>
                  {pillar.name}
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
            <button
              type="button"
              className="cmPrimary"
              disabled={pending || !subject.trim() || !pillarId}
              onClick={save}
            >
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PillarRow({
  pillar,
  onChanged,
}: {
  pillar: ContentPillar;
  onChanged: (pillar: ContentPillar) => void;
}) {
  const [name, setName] = useState(pillar.name);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const changed = name.trim() !== pillar.name;

  useEffect(() => setName(pillar.name), [pillar.name]);

  const save = () => {
    if (!changed) return;
    setError('');
    startTransition(() => {
      void editContentPillar({ id: pillar.id, name }).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onChanged(result.pillar);
      });
    });
  };

  return (
    <div className="cmPillarRow">
      <span
        className="cmPillarDot"
        style={{ '--pillar-dot': PILLAR_ACCENTS[pillar.position % PILLAR_ACCENTS.length] } as React.CSSProperties}
        aria-hidden="true"
      />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
        }}
        aria-label={`Nome do pilar ${pillar.name}`}
      />
      <button
        type="button"
        className="cmMiniBtn"
        disabled={!changed || pending || !name.trim()}
        onClick={save}
      >
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
      {error ? <p className="cmPillarError">{error}</p> : null}
    </div>
  );
}

function PillarManager({
  pillars,
  onClose,
  onChanged,
}: {
  pillars: ContentPillar[];
  onClose: () => void;
  onChanged: (pillar: ContentPillar) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const add = () => {
    if (!name.trim()) return;
    setError('');
    startTransition(() => {
      void addContentPillar(name).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setName('');
        onChanged(result.pillar);
      });
    });
  };

  return (
    <div className="cmOverlay" role="presentation" onMouseDown={onClose}>
      <section
        className="cmEditor cmPillarManager"
        role="dialog"
        aria-modal="true"
        aria-label="Gerir pilares"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cmEditorHead">
          <div>
            <span className="cmEyebrow">Estrutura editorial</span>
            <h2>Pilares</h2>
            <p className="cmEditorIntro">
              Os quatro pilares iniciais continuam aqui, mas a lista agora é tua. Novos pilares
              passam a aparecer imediatamente no formulário de conteúdo.
            </p>
          </div>
          <button type="button" className="cmClose" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="cmPillarAdd">
          <label>
            <span>Novo pilar</span>
            <div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') add();
                }}
                placeholder="Ex. Bastidores de criação"
                autoFocus
              />
              <button className="cmPrimary" type="button" disabled={pending || !name.trim()} onClick={add}>
                {pending ? 'Adicionando…' : 'Adicionar'}
              </button>
            </div>
          </label>
          {error ? <p className="cmError">{error}</p> : null}
        </div>

        <div className="cmPillarList">
          <span className="cmPillarListLabel">Pilares atuais</span>
          {pillars.map((pillar) => (
            <PillarRow key={pillar.id} pillar={pillar} onChanged={onChanged} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ContentManager({
  items,
  pillars,
  view,
  selectedDate,
}: {
  items: ContentBoardItem[];
  pillars: ContentPillar[];
  view: View;
  selectedDate: string;
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<View>(view);
  const [activeDate, setActiveDate] = useState(selectedDate);
  const [localPillars, setLocalPillars] = useState(pillars);
  const [editing, setEditing] = useState<ContentBoardItem | null | undefined>(undefined);
  const [managingPillars, setManagingPillars] = useState(false);
  const [editorDate, setEditorDate] = useState(selectedDate);
  const [moveError, setMoveError] = useState('');
  const [moving, startMove] = useTransition();
  const [navigating, startNavigation] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveView(view);
    setActiveDate(selectedDate);
  }, [view, selectedDate]);

  useEffect(() => setLocalPillars(pillars), [pillars]);

  const loadedStart = weekStart(selectedDate);
  const loadedEnd = addDays(loadedStart, 6);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(loadedStart, index)),
    [loadedStart],
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

  const dayItems = byDate.get(activeDate) ?? [];

  const drag = useBoardDrag(
    (id, zone) => {
      if (!STAGE_KEYS.includes(zone as ContentStage)) return;
      const item = dayItems.find((row) => row.id === id);
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

  const syncView = (nextView: View, nextDate: string) => {
    setActiveView(nextView);
    setActiveDate(nextDate);
    startNavigation(() => {
      router.replace(href(nextView, nextDate), { scroll: false });
    });
  };

  const goToDate = (nextDate: string) => {
    const insideLoadedWeek = nextDate >= loadedStart && nextDate <= loadedEnd;
    if (insideLoadedWeek) {
      syncView(activeView, nextDate);
      return;
    }

    startNavigation(() => {
      router.push(href(activeView, nextDate), { scroll: false });
    });
  };

  const openNew = (date = activeDate) => {
    setEditorDate(date);
    setEditing(null);
  };

  const closeEditor = () => setEditing(undefined);

  const saved = () => {
    closeEditor();
    router.refresh();
  };

  const updateLocalPillar = (next: ContentPillar) => {
    setLocalPillars((current) => {
      const found = current.some((pillar) => pillar.id === next.id);
      const list = found
        ? current.map((pillar) => (pillar.id === next.id ? next : pillar))
        : [...current, next];
      return [...list].sort((a, b) => a.position - b.position);
    });
  };

  const previousDate =
    activeView === 'week' ? addDays(loadedStart, -7) : addDays(activeDate, -1);
  const nextDate =
    activeView === 'week' ? addDays(loadedStart, 7) : addDays(activeDate, 1);
  const today = toIso(new Date());

  return (
    <div className="cm" data-navigating={navigating || undefined}>
      <div className="cmNavProgress" aria-hidden="true" />

      <header className="cmTop">
        <div>
          <span className="cmEyebrow">Gerenciador de conteúdo</span>
          <h1>
            {activeView === 'week'
              ? 'Semana editorial'
              : formatDay(activeDate, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
        </div>

        <div className="cmTopActions">
          <button type="button" className="cmGhostBtn" onClick={() => setManagingPillars(true)}>
            Pilares
          </button>
          <button type="button" className="cmPrimary" onClick={() => openNew()}>
            Novo conteúdo
          </button>
        </div>
      </header>

      <div className="cmToolbar">
        <div className="cmViewSwitch" aria-label="Visualização">
          <button
            type="button"
            data-active={activeView === 'week' || undefined}
            aria-pressed={activeView === 'week'}
            onClick={() => syncView('week', activeDate)}
          >
            Semana
          </button>
          <button
            type="button"
            data-active={activeView === 'day' || undefined}
            aria-pressed={activeView === 'day'}
            onClick={() => syncView('day', activeDate)}
          >
            Dia
          </button>
        </div>

        <div className="cmDateNav">
          <button type="button" aria-label="Anterior" disabled={navigating} onClick={() => goToDate(previousDate)}>
            ‹
          </button>
          <button type="button" className="cmToday" disabled={navigating} onClick={() => goToDate(today)}>
            Hoje
          </button>
          <button type="button" aria-label="Próximo" disabled={navigating} onClick={() => goToDate(nextDate)}>
            ›
          </button>
        </div>
      </div>

      {navigating ? (
        <p className="cmLoadingText" role="status">
          Atualizando…
        </p>
      ) : null}

      {activeView === 'week' ? (
        <div className="cmCalendar">
          {days.map((day) => {
            const dayRows = byDate.get(day) ?? [];
            const isSelected = day === activeDate;
            return (
              <section className="cmDay" key={day} data-selected={isSelected || undefined}>
                <button
                  type="button"
                  className="cmDayHead"
                  onClick={() => syncView('day', day)}
                >
                  <span>{formatDay(day, { weekday: 'short' })}</span>
                  <strong>{formatDay(day, { day: '2-digit' })}</strong>
                </button>

                <div className="cmDayCards">
                  {dayRows.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      accent={pillarAccent(item.pillarId, localPillars)}
                      compact
                      onOpen={() => setEditing(item)}
                    />
                  ))}

                  {!dayRows.length ? (
                    <button className="cmEmptyDay" type="button" onClick={() => openNew(day)}>
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
              const rows = dayItems.filter((item) => item.stage === column.value);
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
                        accent={pillarAccent(item.pillarId, localPillars)}
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
        </>
      )}

      {editing !== undefined ? (
        <Editor
          key={editing?.id ?? `new-${editorDate}-${localPillars.length}`}
          item={editing}
          date={editing?.scheduledFor ?? editorDate}
          pillars={localPillars}
          onClose={closeEditor}
          onSaved={saved}
        />
      ) : null}

      {managingPillars ? (
        <PillarManager
          pillars={localPillars}
          onClose={() => setManagingPillars(false)}
          onChanged={updateLocalPillar}
        />
      ) : null}
    </div>
  );
}
