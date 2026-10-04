import type { ContentPillar } from '@/modules/content-board/domain';

/** Context for the current, simplified content manager. Old commercial
 * pipelines and their fixed pillars must never override this context. */
export const REFERENCE_CONTEXT_VERSION = 'carol-references-2026-10-04-v1';

export const DEFAULT_REFERENCE_REALITY = [
  'Sou a Carol Queiroz, criadora brasileira e moro em Braga, Portugal.',
  'Quero construir meu perfil pessoal e minha presença como microinfluenciadora.',
  'Compartilho minha jornada real em UGC e quero ser uma referência para quem está começando, sem assumir o papel de mentora.',
  'Prefiro produzir sozinha, com o celular, e gravar em casa quando fizer sentido. Conteúdos sobre Braga podem acontecer fora de casa.',
  'Meu interesse comercial em Tech UGC e Canvas UGC está em SaaS e aplicativos que atendem negócios locais. Essas são modalidades comerciais, não formatos de publicação.',
  'Não invente experiências, clientes, resultados, compras, equipamentos ou disponibilidade. Pergunte o que ainda precisa ser confirmado.',
].join('\n\n');

export const REFERENCE_EDITORIAL_METHOD = [
  'Organize a proposta por Tema central, Assunto, Zona e Formato, nessa ordem.',
  'Tema central vem dos temas ativos fornecidos pelo CMS. Não use temas fixos de versões antigas do sistema.',
  'Z1 significa Atração. O conteúdo funciona para quem nunca viu a Carol e não depende de contexto anterior.',
  'Z2 significa Retenção. O conteúdo cria continuidade, recorrência e um motivo para acompanhar.',
  'Z3 significa Conexão. Aproxima as pessoas da Carol por opiniões, gostos, histórias e personalidade.',
  'Z4 significa Comunidade. Envolve participação, rituais, decisões coletivas e histórias compartilhadas. Não é uma zona de venda.',
  'O formato descreve como a peça será apresentada, como Reel falado, mini vlog, carrossel ou sequência de Stories.',
  'O refinamento segue ideia, ângulo, gancho, estrutura, desenvolvimento, revisão e validação humana.',
  'Uma referência analisada não é um conteúdo aprovado. Só a Carol escolhe transformar a aplicação em rascunho e incluí-la no calendário.',
  'Uma proposta pode estar fora da rotina atual. Nesse caso explique a incompatibilidade e a confirmação necessária, sem forçar um encaixe.',
].join('\n');

export type RecentReferenceContent = {
  subject: string; format: string; scheduledFor: string; pillarName?: string;
};

export type ReferenceCreativeContext = {
  version: string;
  realityNotes: string;
  themes: Array<{ id: string; name: string }>;
  recentContent: RecentReferenceContent[];
  method: string;
};

export function buildReferenceContext(input: {
  realityNotes: string;
  pillars: readonly ContentPillar[];
  recentContent: readonly RecentReferenceContent[];
}): ReferenceCreativeContext {
  return {
    version: REFERENCE_CONTEXT_VERSION,
    realityNotes: input.realityNotes.trim() || DEFAULT_REFERENCE_REALITY,
    themes: input.pillars.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name })),
    recentContent: input.recentContent.slice(0, 20),
    method: REFERENCE_EDITORIAL_METHOD,
  };
}
