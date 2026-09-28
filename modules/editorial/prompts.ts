import { z } from 'zod';
import type { Prompt } from '@/modules/ai/gateway';
import {
  COMMERCIAL_MODALITIES,
  CONTENT_LENSES,
  PLATFORM_FORMATS,
  type EditorialObjective,
  type WeekSeed,
} from './domain';

const proposalSchema = z.object({
  topicId: z.string().min(1),
  angle: z.string().min(12).max(220),
  lens: z.enum(CONTENT_LENSES),
  format: z.enum(PLATFORM_FORMATS),
  structure: z.string().min(3).max(120),
  modality: z.enum(COMMERCIAL_MODALITIES),
  whyNow: z.string().min(24).max(420),
});

export const weekOutputSchema = z.object({
  summary: z.string().min(20).max(420),
  proposals: z.array(proposalSchema).length(3),
});

export type WeekProposalOutput = z.infer<typeof weekOutputSchema>;

export type WeekPromptInput = {
  focus: string;
  seeds: Array<{
    topicId: string;
    topic: string;
    pillar: string;
    objective: EditorialObjective;
    deterministicReason: string;
  }>;
};

export const weekProposalPrompt: Prompt<WeekPromptInput, WeekProposalOutput> = {
  task: 'editorial.week.proposals',
  version: 'EDITORIAL_WEEK_V1',
  tier: 'reasoning',
  schema: weekOutputSchema,
  system: `Você é o diretor editorial pessoal da Carol Queiroz. Escreva em português do Brasil.

Seu trabalho aqui NÃO é gerar um banco de ideias. O domínio já escolheu exatamente três assuntos e objetivos. Você precisa propor um ângulo concreto, um formato e explicar por que vale publicar agora.

Contexto congelado
- O Instagram continua sendo perfil pessoal, não catálogo de trabalho.
- Foco comercial: Tech UGC e Canvas UGC para SaaS e apps que atendem negócios locais.
- Tech UGC e Canvas UGC têm o mesmo peso inicial. Não escolha um vencedor.
- UGC tradicional está fora da prioridade atual.
- Os pilares editoriais são Transformando UGC em fonte de renda, Experiências e Casa. Não crie pilar SaaS.
- Carol NÃO quer ser professora de creators. Em UGC, documente experiência, decisões, bastidores, acertos, erros e evolução em primeira pessoa. Evite linguagem do tipo “se você é creator, faça X”.
- “Como é morar em Portugal” não é pauta. Portugal pode aparecer só como contexto de vida.
- Carol quer que o perfil mostre Quem sou, Como penso e O que faço.
- Capacidade sustentável é 3 posts por semana.
- Carrossel e sequência de fotos ainda não foram validados. Se sugerir um deles, trate como exploração, não como formato vencedor.
- Não transforme as três propostas em experiências simultâneas. No máximo uma deve depender de um formato claramente novo naquela semana.

Formato da resposta
- Respeite os topicId recebidos e devolva cada um exatamente uma vez.
- O ângulo precisa dizer o que a peça vai contar, não apenas repetir o nome do assunto.
- “Por que agora” deve usar a razão determinística recebida e o foco atual, sem inventar evento, marca, resultado, número ou história pessoal que não foi fornecida.
- Para Experiências e Casa, modalidade deve ser non_commercial, salvo se o assunto explicitamente for uma peça profissional.
- Para Tech UGC/Canvas UGC, a modalidade pode refletir o assunto.
- Não escreva roteiro, hook ou legenda nesta etapa.`,
  render: (input) => JSON.stringify(input, null, 2),
  maxTokens: 1700,
};

export const singleProposalSchema = z.object({
  proposal: proposalSchema,
});

export type SingleProposalOutput = z.infer<typeof singleProposalSchema>;

type SinglePromptInput = WeekPromptInput & {
  current?: {
    angle: string;
    format: string;
    structure: string;
    lens: string;
    whyNow: string;
  };
  feedback?: string;
  avoidTopicIds?: string[];
};

export const reviseProposalPrompt: Prompt<SinglePromptInput, SingleProposalOutput> = {
  task: 'editorial.week.revise',
  version: 'EDITORIAL_REVISE_V1',
  tier: 'reasoning',
  schema: singleProposalSchema,
  system: `${weekProposalPrompt.system}

Você está revisando UMA proposta. Preserve topicId e objetivo do seed. Use o feedback da Carol para ajustar ângulo, formato, estrutura e explicação. Não escreva roteiro.`,
  render: (input) => JSON.stringify(input, null, 2),
  maxTokens: 800,
};

export const replaceProposalPrompt: Prompt<SinglePromptInput, SingleProposalOutput> = {
  task: 'editorial.week.replace',
  version: 'EDITORIAL_REPLACE_V1',
  tier: 'reasoning',
  schema: singleProposalSchema,
  system: `${weekProposalPrompt.system}

Você está substituindo UMA proposta que a Carol não quis. Use apenas o seed enviado. A nova proposta precisa ser concretamente diferente das anteriores da semana, sem inventar fatos da vida dela. Não escreva roteiro.`,
  render: (input) => JSON.stringify(input, null, 2),
  maxTokens: 800,
};

export function promptSeed(seed: WeekSeed) {
  return {
    topicId: seed.topic.id,
    topic: seed.topic.name,
    pillar: seed.topic.pillar,
    objective: seed.objective,
    deterministicReason: seed.deterministicReason,
  };
}
