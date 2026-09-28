/** Format DNA: a assinatura estrutural de uma peça.
 *
 *  Existe porque «que assunto teve mais views» não ensina nada sobre como a
 *  Carol funciona. Dez dimensões — formato, apresentação, construção,
 *  presença, abertura, ritmo, áudio, duração, texto em tela e modalidade —
 *  dizem o que a peça era, e é sobre elas que o Laboratório compara.
 *
 *  A assinatura sai primeiro do Production Pack, porque ali alguém decidiu.
 *  Só o que o pack não diz é inferido, e o que é inferido fica marcado como
 *  tal: uma dimensão adivinhada nunca se apresenta como escolha dela.
 *
 *  E a regra que dá sentido ao resto: **ausência de alternativa não é
 *  validação**. Onze publicações, todas Reels, não provam que Reel é melhor —
 *  provam que só se usou Reel.
 *
 *  Puro. */

import type { Format, Modality, Structure } from './editorial';
import type { PackPayload } from './pack';

export const DNA_DIMENSIONS = [
  'format', 'presentation', 'construction', 'presence', 'opening',
  'pace', 'audio', 'durationBand', 'onScreenText', 'modality',
] as const;
export type DnaDimension = (typeof DNA_DIMENSIONS)[number];

export const DNA_DIMENSION_LABEL: Record<DnaDimension, string> = {
  format: 'Formato',
  presentation: 'Apresentação',
  construction: 'Construção',
  presence: 'Presença',
  opening: 'Abertura',
  pace: 'Ritmo',
  audio: 'Áudio',
  durationBand: 'Duração',
  onScreenText: 'Texto em tela',
  modality: 'Modalidade',
};

export const PRESENTATIONS = ['talking_head', 'voice_over', 'pov', 'dialogue', 'screen_recording', 'montage'] as const;
export const CONSTRUCTIONS = ['single_scene', 'multi_scene', 'process', 'before_after', 'narrative', 'comparison'] as const;
export const PRESENCES = ['carol', 'product_interface', 'environment', 'other_person'] as const;
export const OPENINGS = ['speech', 'text', 'action', 'image', 'question', 'statement'] as const;
export const PACES = ['slow', 'medium', 'fast'] as const;
export const AUDIOS = ['original_speech', 'voice_over', 'ambient', 'music_trend'] as const;
export const DURATION_BANDS = ['under_10s', '10_20s', '20_40s', '40_60s', 'over_60s'] as const;
export const ON_SCREEN_TEXTS = ['absent', 'punctual', 'leading'] as const;

export type Presentation = (typeof PRESENTATIONS)[number];
export type Construction = (typeof CONSTRUCTIONS)[number];
export type Presence = (typeof PRESENCES)[number];
export type Opening = (typeof OPENINGS)[number];
export type Pace = (typeof PACES)[number];
export type Audio = (typeof AUDIOS)[number];
export type DurationBand = (typeof DURATION_BANDS)[number];
export type OnScreenText = (typeof ON_SCREEN_TEXTS)[number];

export const DNA_VALUE_LABEL: Record<string, string> = {
  talking_head: 'falando para a câmera', voice_over: 'narração', pov: 'POV',
  dialogue: 'diálogo', screen_recording: 'gravação de tela', montage: 'montagem',
  single_scene: 'uma cena', multi_scene: 'várias cenas', process: 'processo',
  before_after: 'antes e depois', narrative: 'narrativa', comparison: 'comparação',
  carol: 'a Carol', product_interface: 'produto ou interface', environment: 'ambiente',
  other_person: 'outra pessoa',
  speech: 'fala', text: 'texto', action: 'ação', image: 'imagem',
  question: 'pergunta', statement: 'afirmação',
  slow: 'baixo', medium: 'médio', fast: 'rápido',
  original_speech: 'fala original', ambient: 'som ambiente', music_trend: 'música ou trend',
  under_10s: 'menos de 10s', '10_20s': '10 a 20s', '20_40s': '20 a 40s',
  '40_60s': '40 a 60s', over_60s: 'mais de 60s',
  absent: 'sem texto', punctual: 'texto pontual', leading: 'texto conduz',
  reel: 'Reel', carousel: 'carrossel', photo_sequence: 'sequência de fotos', story: 'Stories',
  tech_ugc: 'Tech UGC', canvas_ugc: 'Canvas UGC', none: 'não comercial',
};

export type FormatDna = {
  format: Format | null;
  presentation: Presentation | null;
  construction: Construction | null;
  presence: Presence | null;
  opening: Opening | null;
  pace: Pace | null;
  audio: Audio | null;
  durationBand: DurationBand | null;
  onScreenText: OnScreenText | null;
  modality: Modality | null;
  source: 'pack' | 'inferred' | 'carol';
  confidence: 'low' | 'medium' | 'high';
};

export const EMPTY_DNA: FormatDna = {
  format: null, presentation: null, construction: null, presence: null, opening: null,
  pace: null, audio: null, durationBand: null, onScreenText: null, modality: null,
  source: 'inferred', confidence: 'low',
};

export function durationBandOf(seconds: number | null | undefined): DurationBand | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  if (seconds < 10) return 'under_10s';
  if (seconds < 20) return '10_20s';
  if (seconds < 40) return '20_40s';
  if (seconds <= 60) return '40_60s';
  return 'over_60s';
}

/** A assinatura a partir do que foi decidido no pack. É a fonte boa: aqui
 *  ninguém está a adivinhar o que o vídeo era. */
export function dnaFromPack(input: {
  pack: PackPayload;
  format: Format;
  modality: Modality;
  structure?: Structure | null;
  durationSeconds?: number | null;
}): FormatDna {
  const { pack, format, modality } = input;
  const dna: FormatDna = { ...EMPTY_DNA, format, modality, source: 'pack', confidence: 'high' };

  dna.durationBand = durationBandOf(input.durationSeconds);

  switch (pack.kind) {
    case 'spoken_reel': {
      const b = pack.body;
      dna.presentation = input.structure === 'pov' ? 'pov'
        : input.structure === 'voice_over' ? 'voice_over'
        : 'talking_head';
      dna.construction = b.scenes.length > 1 ? 'multi_scene' : 'single_scene';
      dna.presence = 'carol';
      dna.opening = 'speech';
      dna.audio = dna.presentation === 'voice_over' ? 'voice_over' : 'original_speech';
      dna.pace = b.lines.length >= 8 ? 'fast' : b.lines.length >= 4 ? 'medium' : 'slow';
      dna.onScreenText = b.cover ? 'punctual' : 'absent';
      break;
    }
    case 'tech_ugc': {
      const b = pack.body;
      dna.presentation = b.screenRecordings.length ? 'screen_recording' : 'talking_head';
      dna.construction = b.demonstration ? 'process' : 'single_scene';
      dna.presence = b.screenRecordings.length ? 'product_interface' : 'carol';
      dna.opening = 'speech';
      dna.audio = 'original_speech';
      dna.pace = 'medium';
      dna.onScreenText = 'punctual';
      break;
    }
    case 'canvas_ugc': {
      const b = pack.body;
      dna.presentation = b.lines.length ? 'talking_head' : 'montage';
      dna.construction = 'multi_scene';
      dna.presence = 'carol';
      dna.opening = b.lines.length ? 'speech' : 'action';
      dna.audio = 'music_trend';
      dna.pace = 'fast';
      dna.onScreenText = 'leading';
      break;
    }
    case 'carousel': {
      const b = pack.body;
      dna.presentation = 'montage';
      dna.construction = b.slides.length > 4 ? 'narrative' : 'comparison';
      dna.presence = 'environment';
      dna.opening = 'text';
      dna.audio = null;
      dna.pace = null;
      dna.onScreenText = 'leading';
      break;
    }
    case 'photo_sequence': {
      dna.presentation = 'montage';
      dna.construction = 'narrative';
      dna.presence = 'environment';
      dna.opening = 'image';
      dna.audio = null;
      dna.pace = null;
      dna.onScreenText = pack.body.photos.some((p) => p.overlayText) ? 'punctual' : 'absent';
      break;
    }
    case 'story_sequence': {
      dna.presentation = 'talking_head';
      dna.construction = 'multi_scene';
      dna.presence = 'carol';
      dna.opening = 'speech';
      dna.audio = 'original_speech';
      dna.pace = 'fast';
      dna.onScreenText = 'punctual';
      break;
    }
  }

  return dna;
}

/** A assinatura de uma mídia já publicada de que não existe pack. Vem do que
 *  a API dá e do que a legenda deixa ver — e sai marcada como inferida, com
 *  confiança baixa. */
export function dnaFromMedia(media: {
  mediaType: string;
  mediaProductType: string;
  caption: string;
  durationSeconds?: number | null;
}): FormatDna {
  const format: Format | null =
    media.mediaProductType === 'STORY' ? 'story'
    : media.mediaProductType === 'REELS' || media.mediaType === 'VIDEO' ? 'reel'
    : media.mediaType === 'CAROUSEL_ALBUM' ? 'carousel'
    : media.mediaType === 'IMAGE' ? 'photo_sequence'
    : null;

  return {
    ...EMPTY_DNA,
    format,
    durationBand: durationBandOf(media.durationSeconds),
    source: 'inferred',
    confidence: 'low',
  };
}

/** O que a assinatura ainda não sabe. A tela mostra isto em vez de fingir que
 *  a peça não tinha ritmo. */
export function unknownDimensions(dna: FormatDna): DnaDimension[] {
  return DNA_DIMENSIONS.filter((d) => dna[d] === null || dna[d] === undefined);
}

/* ── Maturidade ───────────────────────────────────────────────────────────── */

export const MATURITY_STATES = [
  'untested', 'testing', 'early_signal', 'consistent_pattern', 'conditional', 'no_advantage',
] as const;
export type MaturityState = (typeof MATURITY_STATES)[number];

export const MATURITY_LABEL: Record<MaturityState, string> = {
  untested: 'Não testado',
  testing: 'Em teste',
  early_signal: 'Sinal inicial',
  consistent_pattern: 'Padrão consistente',
  conditional: 'Funciona em certas condições',
  no_advantage: 'Sem evidência de vantagem',
};

/** A frase que a tela mostra. A diferença entre «ainda não testámos» e «não
 *  funciona» é a feature inteira. */
export const MATURITY_PHRASING: Record<MaturityState, string> = {
  untested: 'Você ainda não experimentou isso.',
  testing: 'Está em teste. Ainda é cedo.',
  early_signal: 'Começou a mostrar sinal.',
  consistent_pattern: 'Repetiu o suficiente para orientar decisão.',
  conditional: 'Funciona em certas condições, não sempre.',
  no_advantage: 'Comparado, não mostrou vantagem.',
};

export const MATURITY_POLICY_V1 = {
  version: 'CAROL_FORMAT_MATURITY_V1',
  /** Peças com este valor da dimensão para sair de «em teste». */
  minForSignal: 2,
  /** Peças para poder falar em padrão. */
  minForPattern: 3,
  /** Peças comparáveis com OUTRO valor da mesma dimensão. Sem isto, nunca há
   *  padrão nem falta de vantagem: só há uso. */
  minAlternatives: 2,
} as const;

export type MaturityInput = {
  dimension: DnaDimension;
  value: string;
  /** Peças com este valor, e quantas ficaram acima da mediana dela. */
  pieces: number;
  above: number;
  /** Peças comparáveis com outro valor da mesma dimensão. */
  alternatives: number;
  /** Coortes distintas entre as peças. Três peças no mesmo dia e formato são
   *  quase a mesma medição. */
  cohorts?: number;
};

export type MaturityVerdict = {
  state: MaturityState;
  because: string;
  sampleSize: number;
  comparedWith: number;
  policyVersion: string;
};

/** Onde está esta dimensão na escala de maturidade.
 *
 *  O tecto sem alternativas é `early_signal`, de propósito: é isto que impede
 *  o produto de dizer «Reel funciona melhor» quando Reel foi o único
 *  recipiente usado. */
export function formatMaturity(
  input: MaturityInput,
  policy = MATURITY_POLICY_V1,
): MaturityVerdict {
  const base = { sampleSize: input.pieces, comparedWith: input.alternatives, policyVersion: policy.version };

  if (input.pieces === 0) {
    return { ...base, state: 'untested', because: 'Nenhuma peça usou isso ainda.' };
  }
  if (input.pieces < policy.minForSignal) {
    return { ...base, state: 'testing', because: 'Uma peça só. Ainda não dá para ler nada.' };
  }
  if (input.alternatives < policy.minAlternatives) {
    return {
      ...base,
      state: 'early_signal',
      because: `${input.pieces} peças, mas sem alternativa comparável. Uso não é vantagem.`,
    };
  }
  if (input.pieces < policy.minForPattern) {
    return { ...base, state: 'early_signal', because: `${input.pieces} peças comparadas. É cedo para padrão.` };
  }
  if (input.above === 0) {
    return {
      ...base,
      state: 'no_advantage',
      because: `Comparado com ${input.alternatives} peças de outro tipo, não ficou acima em nenhuma.`,
    };
  }
  if (input.above === input.pieces && (input.cohorts ?? 1) > 1) {
    return {
      ...base,
      state: 'consistent_pattern',
      because: `${input.pieces} peças acima da sua mediana, em contextos diferentes.`,
    };
  }
  return {
    ...base,
    state: 'conditional',
    because: `Ficou acima em ${input.above} de ${input.pieces}. Depende do contexto.`,
  };
}

/** Um estado de maturidade pode orientar a escolha de formato no motor? */
export function maturityInfluence(state: MaturityState): 'prefer' | 'avoid' | 'test' | 'none' {
  if (state === 'consistent_pattern') return 'prefer';
  if (state === 'no_advantage') return 'avoid';
  if (state === 'untested') return 'test';
  return 'none';
}
