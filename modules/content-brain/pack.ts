/** O Production Pack é um container que muda de forma conforme o formato.
 *
 *  Um formulário universal de «roteiro» foi exactamente o que a Carol disse
 *  que não serve: um carrossel não tem fala frase por frase, e um Reel falado
 *  não tem paleta por slide. Cada tipo tem o seu schema, e o que falta para
 *  poder gravar sai como lista de lacunas em português — não como campo vazio
 *  num formulário de quinze linhas.
 *
 *  Duas regras que o schema faz cumprir:
 *
 *  1. **Fala frase por frase é obrigatória no Reel falado.** Preferência
 *     explícita dela, não conveniência de implementação.
 *  2. **CTA e interação são opcionais e precisam de motivo.** Uma enquete
 *     existe porque o Instagram a tem; só entra aqui se servir ao objetivo.
 *
 *  Puro. */

import { z } from 'zod';

import { FORMAT_LABEL, type Format, type Modality } from './editorial';

export const PACK_KINDS = [
  'spoken_reel', 'tech_ugc', 'canvas_ugc', 'carousel', 'photo_sequence', 'story_sequence',
] as const;
export type PackKind = (typeof PACK_KINDS)[number];

export const isPackKind = (v: unknown): v is PackKind =>
  typeof v === 'string' && (PACK_KINDS as readonly string[]).includes(v);

export const PACK_LABEL: Record<PackKind, string> = {
  spoken_reel: 'Reel falado',
  tech_ugc: 'Tech UGC',
  canvas_ugc: 'Canvas UGC',
  carousel: 'Carrossel',
  photo_sequence: 'Sequência de fotos',
  story_sequence: 'Stories',
};

/** Que pack serve esta peça. A modalidade comercial ganha ao formato porque é
 *  ela que muda o que precisa estar no pack — um Tech UGC em Reel precisa de
 *  interface e demonstração, não de direção de performance cinematográfica. */
export function packKindFor(format: Format, modality: Modality): PackKind {
  if (format === 'reel') {
    if (modality === 'tech_ugc') return 'tech_ugc';
    if (modality === 'canvas_ugc') return 'canvas_ugc';
    return 'spoken_reel';
  }
  if (format === 'carousel') return 'carousel';
  if (format === 'photo_sequence') return 'photo_sequence';
  return 'story_sequence';
}

/* ── Peças partilhadas ────────────────────────────────────────────────────── */

/** Uma frase de fala. O `note` é direção de performance para aquela frase —
 *  «mais devagar aqui» —, não texto a dizer. */
const SpokenLine = z.object({
  text: z.string().min(1),
  note: z.string().optional(),
});

/** Só entra com motivo ligado ao objetivo da peça. Sem isso é ruído. */
const Optional = z.object({
  text: z.string().min(1),
  because: z.string().min(1),
});

const Scene = z.object({
  order: z.number().int().nonnegative(),
  what: z.string().min(1),
  where: z.string().optional(),
});

const Asset = z.object({
  kind: z.enum(['b_roll', 'screen_recording', 'photo', 'screenshot', 'graphic', 'icon']),
  what: z.string().min(1),
  ready: z.boolean().default(false),
});

/* ── Schemas por tipo ─────────────────────────────────────────────────────── */

const SpokenReel = z.object({
  hook: z.string().min(1),
  /** Frase por frase. Preferência explícita da Carol. */
  lines: z.array(SpokenLine).min(1),
  scenes: z.array(Scene).default([]),
  assets: z.array(Asset).default([]),
  performance: z.string().default(''),
  editing: z.string().default(''),
  caption: z.string().default(''),
  cover: z.string().default(''),
  cta: Optional.nullable().default(null),
});

const TechUgc = z.object({
  /** O que o produto faz, na cabeça de quem ainda não o usou. */
  productUnderstanding: z.string().min(1),
  useSituation: z.string().min(1),
  argument: z.string().min(1),
  lines: z.array(SpokenLine).min(1),
  interface: z.string().default(''),
  screenRecordings: z.array(Asset).default([]),
  demonstration: z.string().default(''),
  persuasion: z.string().default(''),
  caption: z.string().default(''),
  cta: Optional.nullable().default(null),
});

const CanvasUgc = z.object({
  /** A mecânica que está a ser testada. É o que não pode perder-se. */
  mechanic: z.string().min(1),
  observedStructure: z.string().min(1),
  execution: z.string().min(1),
  brandAdaptation: z.string().default(''),
  lines: z.array(SpokenLine).default([]),
  /** Quando a peça carrega hipótese. Nulo é o caso normal. */
  experimentalVariable: z.string().nullable().default(null),
  caption: z.string().default(''),
});

const Slide = z.object({
  index: z.number().int().nonnegative(),
  copy: z.string().min(1),
  composition: z.string().default(''),
  asset: z.string().optional(),
});

const Carousel = z.object({
  cover: z.string().min(1),
  slides: z.array(Slide).min(2),
  templateKey: z.string().nullable().default(null),
  typography: z.string().default(''),
  palette: z.string().default(''),
  assets: z.array(Asset).default([]),
  caption: z.string().default(''),
  cta: Optional.nullable().default(null),
});

const Photo = z.object({
  index: z.number().int().nonnegative(),
  /** Que função narrativa esta foto cumpre. Sem isto é álbum, não sequência. */
  role: z.string().min(1),
  selection: z.string().default(''),
  treatment: z.string().default(''),
  overlayText: z.string().optional(),
});

const PhotoSequence = z.object({
  photos: z.array(Photo).min(2),
  templateKey: z.string().nullable().default(null),
  caption: z.string().default(''),
  cta: Optional.nullable().default(null),
});

const Frame = z.object({
  index: z.number().int().nonnegative(),
  role: z.string().min(1),
  content: z.string().min(1),
  linkToNext: z.string().optional(),
  /** Enquete/caixa de perguntas. Só com motivo real. */
  interaction: Optional.nullable().default(null),
});

const StorySequence = z.object({
  frames: z.array(Frame).min(2),
  caption: z.string().default(''),
});

export const PACK_SCHEMA = {
  spoken_reel: SpokenReel,
  tech_ugc: TechUgc,
  canvas_ugc: CanvasUgc,
  carousel: Carousel,
  photo_sequence: PhotoSequence,
  story_sequence: StorySequence,
} as const;

export type SpokenReelPack = z.infer<typeof SpokenReel>;
export type TechUgcPack = z.infer<typeof TechUgc>;
export type CanvasUgcPack = z.infer<typeof CanvasUgc>;
export type CarouselPack = z.infer<typeof Carousel>;
export type PhotoSequencePack = z.infer<typeof PhotoSequence>;
export type StorySequencePack = z.infer<typeof StorySequence>;

export type PackPayload =
  | { kind: 'spoken_reel'; body: SpokenReelPack }
  | { kind: 'tech_ugc'; body: TechUgcPack }
  | { kind: 'canvas_ugc'; body: CanvasUgcPack }
  | { kind: 'carousel'; body: CarouselPack }
  | { kind: 'photo_sequence'; body: PhotoSequencePack }
  | { kind: 'story_sequence'; body: StorySequencePack };

/** Valida contra o schema do tipo. Devolve as falhas em português, para a tela
 *  poder dizer o que falta em vez de mostrar um erro de zod. */
export function parsePack(
  kind: PackKind,
  payload: unknown,
): { ok: true; pack: PackPayload } | { ok: false; problems: string[] } {
  const parsed = PACK_SCHEMA[kind].safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'pack'}: ${i.message}`),
    };
  }
  return { ok: true, pack: { kind, body: parsed.data } as PackPayload };
}

/* ── Lacunas ──────────────────────────────────────────────────────────────── */

const missing = (v: unknown) => !v || (typeof v === 'string' && v.trim() === '');

/** O que ainda falta para ela conseguir gravar. Nunca é «pronto» com lacunas.
 *
 *  Não é a mesma coisa que a validação do schema: o schema diz se o objeto
 *  tem forma; isto diz se a peça tem o que é preciso para existir. */
export function packGaps(pack: PackPayload): string[] {
  const gaps: string[] = [];

  switch (pack.kind) {
    case 'spoken_reel': {
      const b = pack.body;
      if (missing(b.hook)) gaps.push('falta o gancho');
      if (b.lines.length === 0) gaps.push('falta a fala frase por frase');
      if (b.lines.some((l) => missing(l.text))) gaps.push('há frase vazia no roteiro');
      if (b.assets.some((a) => a.kind === 'screen_recording' && !a.ready)) {
        gaps.push('a gravação de tela ainda não está pronta');
      }
      break;
    }
    case 'tech_ugc': {
      const b = pack.body;
      if (missing(b.productUnderstanding)) gaps.push('falta entender o produto');
      if (missing(b.useSituation)) gaps.push('falta a situação de uso');
      if (missing(b.argument)) gaps.push('falta o argumento');
      if (b.lines.length === 0) gaps.push('falta a fala frase por frase');
      if (b.screenRecordings.length === 0 && missing(b.interface)) {
        gaps.push('sem interface nem gravação de tela, não se vê o produto');
      }
      break;
    }
    case 'canvas_ugc': {
      const b = pack.body;
      if (missing(b.mechanic)) gaps.push('falta a mecânica do formato');
      if (missing(b.observedStructure)) gaps.push('falta a estrutura observada');
      if (missing(b.execution)) gaps.push('falta como executar');
      break;
    }
    case 'carousel': {
      const b = pack.body;
      if (missing(b.cover)) gaps.push('falta a capa');
      if (b.slides.length < 2) gaps.push('um carrossel precisa de pelo menos dois slides');
      if (b.slides.some((s) => missing(s.copy))) gaps.push('há slide sem texto');
      if (!b.templateKey) gaps.push('falta escolher o template');
      break;
    }
    case 'photo_sequence': {
      const b = pack.body;
      if (b.photos.length < 2) gaps.push('uma sequência precisa de pelo menos duas fotos');
      if (b.photos.some((p) => missing(p.role))) gaps.push('há foto sem função narrativa');
      break;
    }
    case 'story_sequence': {
      const b = pack.body;
      if (b.frames.length < 2) gaps.push('uma sequência precisa de pelo menos dois frames');
      if (b.frames.some((f) => missing(f.content))) gaps.push('há frame sem conteúdo');
      break;
    }
  }

  // Vale para todos: um CTA ou uma interação sem motivo ligado ao objetivo é
  // um recurso da plataforma a entrar por existir.
  const cta = 'cta' in pack.body ? pack.body.cta : null;
  if (cta && missing(cta.because)) gaps.push('o CTA entrou sem motivo ligado ao objetivo');
  if (pack.kind === 'story_sequence') {
    for (const f of pack.body.frames) {
      if (f.interaction && missing(f.interaction.because)) {
        gaps.push(`o frame ${f.index + 1} tem interação sem motivo`);
      }
    }
  }

  return gaps;
}

export const packIsReady = (pack: PackPayload) => packGaps(pack).length === 0;

/* ── Esqueleto ────────────────────────────────────────────────────────────── */

/** O que o pack precisa de conter, por tipo, em linguagem dela. Serve para a
 *  tela explicar o que vai ser gerado antes de o gerar, e para o prompt saber
 *  o que pedir. */
export const PACK_DELIVERABLES: Record<PackKind, readonly string[]> = {
  spoken_reel: [
    'gancho', 'fala frase por frase', 'cenas quando necessário', 'B-roll quando ajuda',
    'gravação de tela quando o produto exige', 'direção de performance',
    'CTA só se servir ao objetivo', 'legenda', 'capa quando precisa', 'direção de edição',
  ],
  tech_ugc: [
    'entendimento do produto', 'situação de uso', 'argumento', 'fala natural',
    'interface', 'gravação de tela', 'demonstração', 'persuasão',
  ],
  canvas_ugc: [
    'mecânica do formato', 'estrutura observada', 'execução leve',
    'adaptação para marca tech', 'variável experimental quando houver',
  ],
  carousel: [
    'capa', 'slide a slide', 'copy final', 'assets', 'template',
    'tipografia', 'paleta', 'composição', 'legenda', 'CTA quando necessário',
  ],
  photo_sequence: [
    'seleção de fotos', 'ordem', 'função narrativa de cada foto',
    'texto sobre imagem quando necessário', 'tratamento', 'legenda',
  ],
  story_sequence: [
    'sequência', 'função de cada frame', 'fala ou texto',
    'ligação entre frames', 'interação só quando houver motivo',
  ],
};

/** Um pack vazio, com a forma certa. A tela abre nisto enquanto a geração não
 *  volta; não é conteúdo, é a estrutura à espera. */
export function emptyPack(kind: PackKind): PackPayload {
  switch (kind) {
    case 'spoken_reel':
      return { kind, body: SpokenReel.parse({ hook: '—', lines: [{ text: '—' }] }) };
    case 'tech_ugc':
      return { kind, body: TechUgc.parse({ productUnderstanding: '—', useSituation: '—', argument: '—', lines: [{ text: '—' }] }) };
    case 'canvas_ugc':
      return { kind, body: CanvasUgc.parse({ mechanic: '—', observedStructure: '—', execution: '—' }) };
    case 'carousel':
      return { kind, body: Carousel.parse({ cover: '—', slides: [{ index: 0, copy: '—' }, { index: 1, copy: '—' }] }) };
    case 'photo_sequence':
      return { kind, body: PhotoSequence.parse({ photos: [{ index: 0, role: '—' }, { index: 1, role: '—' }] }) };
    case 'story_sequence':
      return { kind, body: StorySequence.parse({ frames: [{ index: 0, role: '—', content: '—' }, { index: 1, role: '—', content: '—' }] }) };
  }
}

/** O nome do pack na tela. Só acrescenta o recipiente quando ele diz mais
 *  alguma coisa — «Carrossel · Carrossel» era o nome duas vezes. */
export const packTitle = (kind: PackKind, format: Format) =>
  PACK_LABEL[kind] === FORMAT_LABEL[format] ? PACK_LABEL[kind] : `${PACK_LABEL[kind]} · ${FORMAT_LABEL[format]}`;
