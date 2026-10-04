export type ContentPillar = {
  id: string;
  name: string;
  position: number;
  active: boolean;
};

export const STAGE_KEYS = ['idea', 'script', 'recording', 'editing', 'ready', 'published'] as const;
export type ContentStage = (typeof STAGE_KEYS)[number];

export const CONTENT_STAGES: readonly {
  value: ContentStage;
  label: string;
  description: string;
}[] = [
  { value: 'idea', label: 'Ideia', description: 'Assunto definido, ainda sem roteiro fechado.' },
  { value: 'script', label: 'Roteiro', description: 'Roteiro em construção ou pronto para revisar.' },
  { value: 'recording', label: 'Gravar', description: 'Pronto para ir para a câmera.' },
  { value: 'editing', label: 'Editar', description: 'Material gravado, falta finalizar.' },
  { value: 'ready', label: 'Pronto', description: 'Peça finalizada e pronta para publicar.' },
  { value: 'published', label: 'Publicado', description: 'Conteúdo já publicado.' },
] as const;

export type ContentBoardItem = {
  id: string;
  pillarId: string;
  pillarName: string;
  format: string;
  subject: string;
  script: string;
  scheduledFor: string;
  stage: ContentStage;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export const stageLabel = (stage: ContentStage) =>
  CONTENT_STAGES.find((item) => item.value === stage)?.label ?? stage;

export const ZONE_KEYS = ['z1', 'z2', 'z3', 'z4'] as const;
export type ContentZone = (typeof ZONE_KEYS)[number];

export const CONTENT_ZONES: readonly {
  value: ContentZone;
  code: string;
  label: string;
}[] = [
  { value: 'z1', code: 'Z1', label: 'Atração' },
  { value: 'z2', code: 'Z2', label: 'Retenção' },
  { value: 'z3', code: 'Z3', label: 'Conexão' },
  { value: 'z4', code: 'Z4', label: 'Conversão' },
] as const;

export const zoneCode = (zone: ContentZone) =>
  CONTENT_ZONES.find((item) => item.value === zone)?.code ?? zone.toUpperCase();

export const zoneLabel = (zone: ContentZone) =>
  CONTENT_ZONES.find((item) => item.value === zone)?.label ?? '';


/** O roteiro é uma coluna de texto só, e continua sendo.
 *
 *  Os títulos que a Carol escrevia à mão dentro dele passam a ter campo
 *  próprio na tela sem mudar a base: entram por `parseScript` e voltam por
 *  `serializeScript`. O que o parser não reconhece cai no roteiro em vez de
 *  desaparecer. */
export type ScriptDoc = {
  series: string;
  seriesNumber: string;
  zone: ContentZone | '';
  question: string;
  idea: string;
  angle: string;
  promise: string;
  hook: string;
  structure: string;
  body: string;
  execution: string;
  screenText: string;
  cover: string;
  duration: string;
  gate: string;
};

/** A ordem é a do documento que ela já escrevia. Mexer nela faz o texto
 *  salvo sair reordenado sem ninguém ter pedido. */
const BLOCK_FIELDS = [
  { key: 'idea', head: 'IDEIA' },
  { key: 'angle', head: 'ÂNGULO' },
  { key: 'promise', head: 'PROMESSA' },
  { key: 'hook', head: 'GANCHO' },
  { key: 'structure', head: 'ESTRUTURA' },
  { key: 'body', head: 'ROTEIRO' },
  { key: 'execution', head: 'EXECUÇÃO' },
  { key: 'screenText', head: 'TEXTO NA TELA' },
  { key: 'cover', head: 'CAPA' },
  { key: 'duration', head: 'DURAÇÃO ESTIMADA' },
  { key: 'gate', head: 'GATE FINAL' },
] as const;

type BlockKey = (typeof BLOCK_FIELDS)[number]['key'];

const SERIES_HEAD = 'SÉRIE';
const ZONE_HEAD = 'ZONA';
const QUESTION_HEAD = 'PERGUNTA DA PEÇA';

export const EMPTY_SCRIPT: ScriptDoc = {
  series: '',
  seriesNumber: '',
  zone: '',
  question: '',
  idea: '',
  angle: '',
  promise: '',
  hook: '',
  structure: '',
  body: '',
  execution: '',
  screenText: '',
  cover: '',
  duration: '',
  gate: '',
};

/** Sem acentos e em maiúsculas: «Ângulo», «ANGULO» e «ângulo» são o mesmo
 *  título, e exigir a forma exata transformaria um acento perdido em texto
 *  solto no meio do roteiro. */
const flatten = (line: string) =>
  line
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const INLINE_HEADS = [
  { key: 'series' as const, head: flatten(SERIES_HEAD) },
  { key: 'zone' as const, head: flatten(ZONE_HEAD) },
  { key: 'question' as const, head: flatten(QUESTION_HEAD) },
];

const BLOCK_HEADS = BLOCK_FIELDS.map((field) => ({
  key: field.key,
  head: flatten(field.head),
}));

const splitSeries = (value: string): [string, string] => {
  const match = value.match(/^(.*\S)\s*·\s*(\d+)$/);
  return match ? [match[1].trim(), match[2]] : [value.trim(), ''];
};

const zoneFrom = (value: string): ContentZone | '' => {
  const match = flatten(value).match(/Z\s*([1-4])/);
  return match ? (`z${match[1]}` as ContentZone) : '';
};

export function parseScript(text: string): ScriptDoc {
  const doc: ScriptDoc = { ...EMPTY_SCRIPT };
  const blocks = new Map<BlockKey, string[]>();
  const push = (key: BlockKey, line: string) => {
    const group = blocks.get(key) ?? [];
    group.push(line);
    blocks.set(key, group);
  };

  let current: BlockKey = 'body';

  for (const line of text.split('\n')) {
    const flat = flatten(line);

    const inline = INLINE_HEADS.find((entry) => flat.startsWith(`${entry.head}:`));
    if (inline) {
      const value = line.slice(line.indexOf(':') + 1).trim();
      if (inline.key === 'series') [doc.series, doc.seriesNumber] = splitSeries(value);
      else if (inline.key === 'zone') doc.zone = zoneFrom(value);
      else doc.question = value;
      continue;
    }

    const block = BLOCK_HEADS.find((entry) => flat === entry.head);
    if (block) {
      current = block.key;
      continue;
    }

    push(current, line);
  }

  for (const field of BLOCK_FIELDS) {
    doc[field.key] = (blocks.get(field.key) ?? []).join('\n').trim();
  }

  return doc;
}

export function serializeScript(doc: ScriptDoc): string {
  const parts: string[] = [];

  const series = doc.series.trim();
  // O número sem o nome da série não tem onde se escrever de volta: «SÉRIE: 01»
  // relê-se como nome. Fica de fora em vez de voltar trocado.
  if (series) {
    const number = doc.seriesNumber.trim();
    parts.push(`${SERIES_HEAD}: ${number ? `${series} · ${number}` : series}`);
  }

  const facts: string[] = [];
  if (doc.zone) facts.push(`${ZONE_HEAD}: ${zoneCode(doc.zone)} — ${zoneLabel(doc.zone)}`);
  if (doc.question.trim()) facts.push(`${QUESTION_HEAD}: ${doc.question.trim()}`);
  if (facts.length) parts.push(facts.join('\n'));

  for (const field of BLOCK_FIELDS) {
    const value = doc[field.key].trim();
    if (!value) continue;
    // Uma nota solta continua uma nota solta: o título só aparece quando há
    // outra coisa acima dele para separar.
    if (field.key === 'body' && !parts.length) parts.push(value);
    else parts.push(`${field.head}\n${value}`);
  }

  return parts.join('\n\n');
}

/** O roteiro lido para gravar, não para editar.
 *
 *  Três coisas diferentes cabem na mesma coluna de texto: a direção entre
 *  colchetes, a fala entre aspas e a nota solta. Separá-las é o que permite
 *  pintar cada uma à sua maneira — e é regra pura, por isso vive aqui. */
export type ScriptLineKind = 'direction' | 'speech' | 'note';
export type ScriptLine = { kind: ScriptLineKind; text: string };

const DIRECTION = /^\[([^\]]*)\]$/;
const OPENS_SPEECH = ['"', '\u201C', '\u2018', "'"];

export function scriptLines(body: string): ScriptLine[] {
  const out: ScriptLine[] = [];

  for (const paragraph of body.split(/\n[ \t]*\n/)) {
    let buffer: string[] = [];

    const flush = () => {
      const text = buffer.join('\n').trim();
      buffer = [];
      if (!text) return;
      const speech = OPENS_SPEECH.some((mark) => text.startsWith(mark));
      out.push({ kind: speech ? 'speech' : 'note', text });
    };

    for (const line of paragraph.split('\n')) {
      const direction = line.trim().match(DIRECTION);
      if (direction) {
        flush();
        out.push({ kind: 'direction', text: direction[1].trim() });
        continue;
      }
      buffer.push(line);
    }

    flush();
  }

  return out;
}
