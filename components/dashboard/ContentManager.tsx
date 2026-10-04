'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addContentPillar,
  editContentPillar,
  moveContentCard,
  removeContentCard,
  saveContentCard,
} from '@/app/dashboard/content-manager-actions';
import Spinner from '@/components/dashboard/Spinner';
import { useBoardDrag } from '@/components/dashboard/useBoardDrag';
import {
  CONTENT_STAGES,
  CONTENT_ZONES,
  EMPTY_SCRIPT,
  STAGE_KEYS,
  parseScript,
  scriptLines,
  serializeScript,
  stageLabel,
  zoneCode,
  zoneLabel,
  type ContentBoardItem,
  type ContentPillar,
  type ContentStage,
  type ContentZone,
  type ScriptDoc,
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
  new Intl.DateTimeFormat('pt-BR', options ?? { weekday: 'short', day: '2-digit' }).format(
    fromIso(value),
  );

/** «segunda», não «seg.» nem «segunda-feira».
 *
 *  O cabeçalho da semana tem largura para o nome inteiro, e o «-feira» é a
 *  única parte dele que nunca distingue um dia do outro. */
const weekdayName = (value: string) =>
  formatDay(value, { weekday: 'long' }).replace('-feira', '');

const href = (view: View, date: string) =>
  `/dashboard/content?view=${view}&date=${date}`;

function pillarAccent(pillarId: string, pillars: ContentPillar[]) {
  const index = Math.max(
    0,
    pillars.findIndex((pillar) => pillar.id === pillarId),
  );
  return PILLAR_ACCENTS[index % PILLAR_ACCENTS.length];
}

/** A zona é uma cor, não uma frase. No cartão cabe o código; o nome por
 *  extenso fica no title, que é onde ele é lido sem roubar espaço ao assunto. */
function ZoneBadge({ zone }: { zone: ContentZone }) {
  return (
    <span className="cmBadge cmZone" data-zone={zone} title={`${zoneCode(zone)} — ${zoneLabel(zone)}`}>
      {zoneCode(zone)}
    </span>
  );
}

function Badges({ zone, format }: { zone: ContentZone | ''; format: string }) {
  if (!zone && !format.trim()) return null;

  return (
    <span className="cmBadges">
      {zone ? <ZoneBadge zone={zone} /> : null}
      {format.trim() ? <span className="cmBadge cmFormat">{format.trim()}</span> : null}
    </span>
  );
}

/** O resumo do cartão é a ideia, não o começo do arquivo.
 *
 *  Antes era o roteiro em bruto, e com os cabeçalhos lá dentro o cartão abria
 *  sempre com «SÉRIE: …» em vez de dizer do que a peça trata. */
const cardPreview = (doc: ScriptDoc) => {
  const text = (doc.idea || doc.body).replace(/\s+/g, ' ').trim();
  if (!text) return 'Roteiro ainda não escrito';
  return text.length > 150 ? `${text.slice(0, 150)}…` : text;
};

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
  const doc = useMemo(() => parseScript(item.script), [item.script]);

  return (
    <article
      className="cmCard"
      data-compact={compact || undefined}
      style={{ '--pillar-accent': accent } as React.CSSProperties}
    >
      <button className="cmCardBody" type="button" onClick={onOpen}>
        <Badges zone={doc.zone} format={item.format} />
        <span className="cmCardMeta">
          <span>{item.pillarName}</span>
        </span>
        <strong>{item.subject}</strong>
        {!compact ? <p>{cardPreview(doc)}</p> : null}
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

function NextTaskBanner({
  item,
  today,
  onOpen,
}: {
  item: ContentBoardItem;
  today: string;
  onOpen: () => void;
}) {
  const doc = useMemo(() => parseScript(item.script), [item.script]);
  const quando =
    item.scheduledFor === today
      ? 'Hoje'
      : item.scheduledFor === addDays(today, 1)
        ? 'Amanhã'
        : formatDay(item.scheduledFor, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="cmNext" aria-label="Próxima tarefa">
      <div className="cmNextMain">
        <span className="cmNextLabel">Próxima tarefa · {quando}</span>
        <strong>{item.subject}</strong>
        <p>
          {item.pillarName} · {stageLabel(item.stage)}
        </p>
      </div>

      <div className="cmNextSide">
        <Badges zone={doc.zone} format={item.format} />
        <button type="button" className="cmGhostBtn" onClick={onOpen}>
          Ver detalhes
        </button>
      </div>
    </section>
  );
}

/** Um campo é sempre rótulo em cima, controle embaixo. Com dezasseis deles no
 *  editor, escrever o `<label>` à mão em cada um era onde a marcação começava
 *  a divergir sozinha. */
function Field({
  label,
  wide = true,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? 'cmWide' : undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  wide = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  wide?: boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      <textarea
        className="cmShortArea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </Field>
  );
}

/** O roteiro lido para gravar.
 *
 *  A direção entre colchetes deixa de ser texto igual ao resto: ela diz o que
 *  fazer com a câmera, não o que falar, e lida de longe com o telemóvel na
 *  mão as duas coisas precisam de se distinguir sem ser preciso ler. */
function ScriptRead({ body }: { body: string }) {
  const lines = useMemo(() => scriptLines(body), [body]);

  if (!lines.length) {
    return <p className="cmReadEmpty">O roteiro ainda não foi escrito.</p>;
  }

  return (
    <div className="cmRead">
      {lines.map((line, index) => {
        if (line.kind === 'direction') {
          return (
            <p className="cmDirection" key={index}>
              {line.text}
            </p>
          );
        }
        return (
          <p className={line.kind === 'speech' ? 'cmSpeech' : 'cmNote'} key={index}>
            {line.text}
          </p>
        );
      })}
    </div>
  );
}

const EDITOR_TABS = [
  { value: 'piece', label: 'Peça' },
  { value: 'strategy', label: 'Estratégia' },
  { value: 'script', label: 'Roteiro' },
  { value: 'shoot', label: 'Gravação' },
] as const;

type EditorTab = (typeof EDITOR_TABS)[number]['value'];

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
  const [tab, setTab] = useState<EditorTab>('piece');
  const [pillarId, setPillarId] = useState(item?.pillarId || pillars[0]?.id || '');
  const [format, setFormat] = useState(item?.format ?? '');
  const [subject, setSubject] = useState(item?.subject ?? '');
  const [doc, setDoc] = useState<ScriptDoc>(() =>
    item ? parseScript(item.script) : EMPTY_SCRIPT,
  );
  // Quem abre uma peça que já tem roteiro quase sempre vai gravá-la, não
  // reescrevê-la. Quem abre uma vazia só pode escrever.
  const [reading, setReading] = useState(() => Boolean(doc.body.trim()));
  const [scheduledFor, setScheduledFor] = useState(item?.scheduledFor ?? date);
  const [stage, setStage] = useState<ContentStage>(item?.stage ?? 'idea');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const patch = (next: Partial<ScriptDoc>) => setDoc((current) => ({ ...current, ...next }));

  const save = () => {
    // O assunto vive noutra aba. Recusar sem dizer onde está o campo é o botão
    // desligado sem motivo visível que esta troca de aba evita.
    if (!subject.trim()) {
      setTab('piece');
      setError('Informe o assunto.');
      return;
    }

    setError('');
    startTransition(() => {
      void saveContentCard({
        id: item?.id,
        pillarId,
        format,
        subject,
        script: serializeScript(doc),
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
            <span className="cmBadges">
              {doc.zone ? <ZoneBadge zone={doc.zone} /> : null}
              {format.trim() ? <span className="cmBadge cmFormat">{format.trim()}</span> : null}
              <span className="cmBadge cmStageBadge">{stageLabel(stage)}</span>
            </span>
          </div>
          <button type="button" className="cmClose" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="cmTabs" role="tablist" aria-label="Partes do conteúdo">
          {EDITOR_TABS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={tab === entry.value}
              data-active={tab === entry.value || undefined}
              onClick={() => setTab(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'piece' ? (
          <div className="cmForm" key="piece">
            <Field label="Pilar" wide={false}>
              <select value={pillarId} onChange={(event) => setPillarId(event.target.value)}>
                {pillars.map((pillar) => (
                  <option key={pillar.id} value={pillar.id}>
                    {pillar.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Formato" wide={false}>
              <input
                value={format}
                onChange={(event) => setFormat(event.target.value)}
                placeholder="Reel, carrossel, story..."
              />
            </Field>

            <Field label="Assunto">
              <textarea
                className="cmSubjectArea"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Sobre o que este conteúdo vai falar"
                rows={3}
                autoFocus
              />
            </Field>

            <Field label="Data" wide={false}>
              <input
                type="date"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
            </Field>

            <Field label="Etapa" wide={false}>
              <select
                value={stage}
                onChange={(event) => setStage(event.target.value as ContentStage)}
              >
                {CONTENT_STAGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        {tab === 'strategy' ? (
          <div className="cmForm" key="strategy">
            <Field label="Zona" wide={false}>
              <select
                value={doc.zone}
                onChange={(event) => patch({ zone: event.target.value as ContentZone | '' })}
              >
                <option value="">Sem zona</option>
                {CONTENT_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.code} — {zone.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Número na série" wide={false}>
              <input
                value={doc.seriesNumber}
                onChange={(event) => patch({ seriesNumber: event.target.value })}
                inputMode="numeric"
                placeholder="01"
              />
            </Field>

            <Field label="Série">
              <input
                value={doc.series}
                onChange={(event) => patch({ series: event.target.value })}
                placeholder="Transformando UGC em fonte de renda"
              />
            </Field>

            <Field label="Pergunta da peça">
              <input
                value={doc.question}
                onChange={(event) => patch({ question: event.target.value })}
                placeholder="A pergunta que este conteúdo responde"
              />
            </Field>

            <Area
              label="Ideia"
              value={doc.idea}
              onChange={(idea) => patch({ idea })}
              placeholder="O que este conteúdo mostra"
            />

            <Area
              label="Ângulo"
              value={doc.angle}
              onChange={(angle) => patch({ angle })}
              placeholder="Por que esta peça é contada assim"
            />

            <Area
              label="Promessa"
              value={doc.promise}
              onChange={(promise) => patch({ promise })}
              placeholder="O que quem assiste leva daqui"
            />

            <Area
              label="Gate final"
              value={doc.gate}
              onChange={(gate) => patch({ gate })}
              placeholder="O que precisa estar verdadeiro para esta peça poder sair"
            />
          </div>
        ) : null}

        {tab === 'script' ? (
          <div className="cmForm" key="script">
            <Area
              label="Gancho"
              value={doc.hook}
              onChange={(hook) => patch({ hook })}
              placeholder="A primeira frase, dita como ela diria"
              rows={2}
            />

            <Area
              label="Estrutura"
              value={doc.structure}
              onChange={(structure) => patch({ structure })}
              placeholder="Mudança → dúvida → descoberta → decisão"
              rows={2}
            />

            <div className="cmWide cmScriptField">
              <div className="cmScriptHead">
                <span className="cmFieldLabel">Roteiro</span>
                <div className="cmViewSwitch cmSwitchMini">
                  <button
                    type="button"
                    data-active={!reading || undefined}
                    aria-pressed={!reading}
                    onClick={() => setReading(false)}
                  >
                    Escrever
                  </button>
                  <button
                    type="button"
                    data-active={reading || undefined}
                    aria-pressed={reading}
                    onClick={() => setReading(true)}
                  >
                    Gravar
                  </button>
                </div>
              </div>

              {reading ? (
                <ScriptRead body={doc.body} />
              ) : (
                <textarea
                  value={doc.body}
                  onChange={(event) => patch({ body: event.target.value })}
                  placeholder={'[direção entre colchetes]\n“fala entre aspas”'}
                  aria-label="Roteiro"
                  rows={16}
                />
              )}
            </div>
          </div>
        ) : null}

        {tab === 'shoot' ? (
          <div className="cmForm" key="shoot">
            <Area
              label="Execução"
              value={doc.execution}
              onChange={(execution) => patch({ execution })}
              placeholder="Como gravar: enquadramento, B-roll, o que evitar"
            />

            <Area
              label="Texto na tela"
              value={doc.screenText}
              onChange={(screenText) => patch({ screenText })}
              placeholder="O que aparece escrito por cima"
              rows={2}
            />

            <Area
              label="Capa"
              value={doc.cover}
              onChange={(cover) => patch({ cover })}
              placeholder="A frase da capa"
              rows={2}
            />

            <Field label="Duração estimada" wide={false}>
              <input
                value={doc.duration}
                onChange={(event) => patch({ duration: event.target.value })}
                placeholder="40–50 segundos"
              />
            </Field>
          </div>
        ) : null}

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
              disabled={pending || !pillarId}
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
              Os quatro pilares iniciais continuam aqui, mas a lista agora pode ser gerida neste espaço. Novos pilares
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
            <PillarRow key={`${pillar.id}:${pillar.name}`} pillar={pillar} onChanged={onChanged} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ContentManager({
  items,
  pillars,
  nextItem,
  view,
  selectedDate,
}: {
  items: ContentBoardItem[];
  pillars: ContentPillar[];
  nextItem: ContentBoardItem | null;
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
  // Só a troca de semana espera o servidor. Semana ↔ Dia e um dia da mesma
  // semana já estão carregados, e mostrar barra de progresso neles era a parte
  // que piscava sem haver nada para esperar.
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [moving, startMove] = useTransition();
  const [, startNavigation] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);

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

    // `loadingWeek` não precisa voltar a falso: a semana nova remonta o
    // gerenciador inteiro, e o estado nasce limpo com ela.
    setLoadingWeek(true);
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
    <div className="cm" data-navigating={loadingWeek || undefined}>
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

      {nextItem ? (
        <NextTaskBanner item={nextItem} today={today} onOpen={() => setEditing(nextItem)} />
      ) : null}

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
          {loadingWeek ? <Spinner label="Carregando a semana" /> : null}
          <button type="button" aria-label="Anterior" disabled={loadingWeek} onClick={() => goToDate(previousDate)}>
            ‹
          </button>
          <button type="button" className="cmToday" disabled={loadingWeek} onClick={() => goToDate(today)}>
            Hoje
          </button>
          <button type="button" aria-label="Próximo" disabled={loadingWeek} onClick={() => goToDate(nextDate)}>
            ›
          </button>
        </div>
      </div>

      <div className="cmView" key={activeView} data-waiting={loadingWeek || undefined}>
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
                    <span>{weekdayName(day)}</span>
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
      </div>

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
