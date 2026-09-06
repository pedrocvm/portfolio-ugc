/** Os contratos de saída do Content Brain.
 *
 *  Nenhuma etapa que muda o domínio depende de texto livre. Cada uma devolve
 *  JSON validado por Zod e passa depois por invariants determinísticos — o
 *  schema garante a forma, o domínio garante a verdade.
 *
 *  A regra que aparece em quase todos: **fatos vêm com índice**. Um beat, um
 *  enquadramento ou uma frase de roteiro apontam para o fato que os sustenta;
 *  sem ponteiro, ficam marcados como sugestão e não passam por fato. É isso
 *  que impede o modelo de acrescentar uma crise que nunca houve.
 *
 *  Puro. */

import { z } from 'zod';

const confidence = z.enum(['low', 'medium', 'high']);

/* ── Extração ─────────────────────────────────────────────────────────────── */

/** O que aconteceu, tirado do que ela contou. Sem emoção inventada. */
export const StoryExtractionSchema = z.object({
  title: z.string().max(90).describe('título humano curto, nunca um gancho'),
  summary: z.string().max(400).describe('resumo factual, sem adjetivo que ela não usou'),
  facts: z
    .array(z.string())
    .min(1)
    .max(10)
    .describe('acontecimentos em ordem, um por linha, só o que ela disse'),
  uncertain_points: z
    .array(z.string())
    .max(5)
    .describe('o que ficou ambíguo e precisa de confirmação dela'),
  /** Citações literais. O que ela disse mesmo, para preservar a voz. */
  carol_quotes: z.array(z.string()).max(6).describe('frases exatas dela, copiadas sem reescrever'),
  candidate_territories: z.array(z.string()).max(4),
  occurred_hint: z.string().nullable().describe('quando aconteceu, se ela disse; senão null'),
  /** Só se ela tiver dito. Nunca deduzido do tom. */
  stated_meaning: z.string().nullable(),
  confidence,
});
export type StoryExtraction = z.infer<typeof StoryExtractionSchema>;

/** O resumo que se devolve para ela confirmar, e as poucas perguntas que faltam. */
export const StoryConfirmationSchema = z.object({
  recap: z.string().max(400).describe('«Entendi assim: X, depois Y, e no fim Z.»'),
  questions: z
    .array(
      z.object({
        kind: z.enum(['fact', 'reaction', 'contrast', 'meaning', 'identification', 'privacy', 'continuity', 'visual']),
        text: z.string().max(160),
      }),
    )
    .max(3)
    .describe('no máximo três, e a interface mostra uma de cada vez'),
  ready_to_frame: z.boolean().describe('verdadeiro só quando já se sabe o que aconteceu e por que ela quer contar'),
});
export type StoryConfirmation = z.infer<typeof StoryConfirmationSchema>;

/* ── Mapeamento editorial ─────────────────────────────────────────────────── */

export const StoryEditorialFitSchema = z.object({
  pillars: z
    .array(
      z.object({
        pillar: z.enum(['attraction_journey', 'information_retention', 'authority_conversion', 'connection_personal']),
        fit: confidence,
        reason: z.string().max(200),
      }),
    )
    .min(1)
    .max(3),
  territories: z.array(z.string()).max(4),
  universal_relevance: z.string().max(200).describe('o que faz outra pessoa reconhecer-se, ou "não vejo ponte clara"'),
  needs_previous_context: z.boolean().describe('verdadeiro se só faz sentido para quem já a segue'),
});
export type StoryEditorialFit = z.infer<typeof StoryEditorialFitSchema>;

/** Enquadramentos possíveis. Cada um aponta para os fatos que o sustentam —
 *  um enquadramento sem `fact_indexes` é recusado pelo serviço. */
export const StoryFramingSchema = z.object({
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().max(120).describe('o ponto, na linguagem dela'),
        because: z.string().max(200),
        fact_indexes: z.array(z.number().int()).min(1),
      }),
    )
    .min(2)
    .max(3),
});
export type StoryFraming = z.infer<typeof StoryFramingSchema>;

/* ── Estrutura ────────────────────────────────────────────────────────────── */

export const StoryStructureSchema = z.object({
  central_point: z.string().max(200),
  beats: z
    .array(
      z.object({
        order: z.number().int(),
        purpose: z.enum(['open', 'context', 'event', 'turn', 'reaction', 'proof', 'close']),
        /** A intenção do momento, não a fala. A fala é dela. */
        intent: z.string().max(200),
        fact_indexes: z.array(z.number().int()),
      }),
    )
    .min(3)
    .max(7),
  visual_support: z
    .array(
      z.object({
        beat: z.number().int(),
        kind: z.enum(['existing_broll', 'record_new', 'optional']),
        description: z.string().max(160),
      }),
    )
    .max(6),
  /** O que tem de continuar factual e não pode ser reencenado como espontâneo. */
  must_not_invent: z.array(z.string()).max(5),
  suggested_duration_seconds: z.number().int().min(5).max(180),
  duration_reason: z.string().max(160),
  format: z.enum(['talking_head', 'talking_broll', 'vlog', 'aesthetic', 'humor_pov', 'bts', 'demo', 'carousel']),
});
export type StoryStructure = z.infer<typeof StoryStructureSchema>;

/** O roteiro, sempre a última etapa e sempre opcional.
 *
 *  `source_quotes` obriga o modelo a dizer de onde tirou cada frase que
 *  atribui a ela — e o serviço verifica que existem mesmo no material. */
export const VoiceScriptSchema = z.object({
  script: z.string().max(2400),
  takes: z.array(z.object({ beat: z.number().int(), line: z.string().max(400) })).max(8),
  source_quotes: z.array(z.string()).describe('frases reais dela usadas ou adaptadas'),
  invented_nothing: z.boolean(),
  note: z.string().max(200).describe('o que ela pode mudar à vontade'),
});
export type VoiceScript = z.infer<typeof VoiceScriptSchema>;

/* ── Séries ───────────────────────────────────────────────────────────────── */

export const SeriesClusterSchema = z.object({
  clusters: z
    .array(
      z.object({
        story_ids: z.array(z.string()).min(2),
        premise: z.string().max(200),
        arc: z.string().max(200),
        mechanism: z.enum(['journey', 'challenge', 'recurring_process', 'public_learning', 'lens_format']),
        why: z.string().max(200).describe('o que estas histórias partilham, em concreto'),
      }),
    )
    .max(3),
});
export type SeriesCluster = z.infer<typeof SeriesClusterSchema>;

/* ── Desempenho ───────────────────────────────────────────────────────────── */

export const PerformanceReadingSchema = z.object({
  observations: z.array(z.string()).max(4).describe('o que se mediu, sem causa'),
  signal_candidate: z
    .object({
      mechanism: z.string().max(120).describe('o mecanismo que já estava registado na estrutura'),
      metrics: z.array(z.string()).max(4),
      why: z.string().max(240),
    })
    .nullable(),
  /** Verdadeiro quando a leitura honesta é «ainda é cedo». */
  too_early: z.boolean(),
  note_for_carol: z.string().max(240).describe('uma frase, sem linguagem de urgência'),
});
export type PerformanceReading = z.infer<typeof PerformanceReadingSchema>;

/* ── Candidatos proativos ─────────────────────────────────────────────────── */

export const EventCandidateSchema = z.object({
  worth_saving: z.boolean(),
  /** O fato, seco. Sem «uma ótima notícia». */
  fact: z.string().max(300),
  why: z.string().max(200),
  confidence,
});
export type EventCandidate = z.infer<typeof EventCandidateSchema>;

/* ── Comentários ──────────────────────────────────────────────────────────── */

export const CommentQualitySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      quality: z.enum([
        'generic_praise', 'identification', 'question', 'own_experience',
        'purchase_intent', 'professional', 'creator_to_creator', 'brand', 'other',
      ]),
    }),
  ),
});
export type CommentQuality = z.infer<typeof CommentQualitySchema>;

/* ── Lentes ───────────────────────────────────────────────────────────────── */

/** Classificar uma situação que ela já contou numa lente conhecida.
 *
 *  Só se usa quando ela chega dizendo «já sei o que quero contar» — a
 *  classificação fica gravada como `inferred` e nunca passa por escolha dela. */
export const LensInferenceSchema = z.object({
  lens_id: z.string().nullable().describe('o id de uma lente que existe, ou null se nenhuma serve'),
  confidence,
  because: z.string().max(200).describe('o que na situação aponta para essa direção'),
});
export type LensInference = z.infer<typeof LensInferenceSchema>;
