/** O ciclo de vida de uma proposta, dos oito estados que o PDF nomeia.
 *
 *  Existe para uma coisa só: nenhuma peça salta a pessoa. A geração de um
 *  Production Pack não a torna pronta, e publicar não a torna aprendida. As
 *  transições inválidas são recusadas aqui, no serviço e num `check` do
 *  Postgres — três barreiras, porque esta é a que mais tenta ser contornada
 *  quando alguém quer «só automatizar o caminho feliz».
 *
 *  Puro. */

export const PROPOSAL_STATUSES = [
  'proposed', 'approved_to_develop', 'to_validate', 'ready_to_produce',
  'in_production', 'published', 'in_analysis', 'learning_recorded',
  'swapped', 'dropped',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const isProposalStatus = (v: unknown): v is ProposalStatus =>
  typeof v === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(v);

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  proposed: 'Proposto',
  approved_to_develop: 'Aprovado para desenvolver',
  to_validate: 'Para validar',
  ready_to_produce: 'Pronto para produzir',
  in_production: 'Em produção',
  published: 'Publicado',
  in_analysis: 'Em análise',
  learning_recorded: 'Aprendizado registrado',
  swapped: 'Trocado',
  dropped: 'Descartado',
};

export const STATUS_MEANS: Record<ProposalStatus, string> = {
  proposed: 'Esperando sua validação.',
  approved_to_develop: 'Assunto, ângulo e formato aceitos.',
  to_validate: 'O material está pronto para você revisar.',
  ready_to_produce: 'Validado. Pode gravar.',
  in_production: 'Gravação, design ou edição em andamento.',
  published: 'No ar e ligado à mídia.',
  in_analysis: 'A janela de coleta ainda está aberta.',
  learning_recorded: 'O resultado já virou aprendizado.',
  swapped: 'Você pediu outra no lugar.',
  dropped: 'Fora da semana.',
};

const TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  proposed: ['approved_to_develop', 'swapped', 'dropped'],
  // Voltar para «aprovado» é o caminho do «quero ajustar» no pack.
  approved_to_develop: ['to_validate', 'dropped'],
  to_validate: ['ready_to_produce', 'approved_to_develop', 'dropped'],
  ready_to_produce: ['in_production', 'to_validate', 'dropped'],
  in_production: ['published', 'ready_to_produce', 'dropped'],
  published: ['in_analysis'],
  in_analysis: ['learning_recorded'],
  learning_recorded: [],
  swapped: [],
  dropped: [],
};

/** Estados em que a peça já passou pela validação humana do material. */
export const VALIDATED_STATUSES: readonly ProposalStatus[] = [
  'ready_to_produce', 'in_production', 'published', 'in_analysis', 'learning_recorded',
];

/** Estados que consomem capacidade da semana. `swapped` e `dropped` não. */
export const LIVE_STATUSES: readonly ProposalStatus[] = [
  'proposed', 'approved_to_develop', 'to_validate', 'ready_to_produce', 'in_production',
];

export type TransitionCheck = { ok: true } | { ok: false; because: string };

/** Pode ir de `from` para `to`?
 *
 *  `hasValidation` é o segundo portão e não é opcional: um caminho que chegue
 *  a «pronto para produzir» sem alguém ter carregado em validar é o bug que
 *  esta função existe para tornar impossível. */
export function canTransition(
  from: ProposalStatus,
  to: ProposalStatus,
  ctx: { approved: boolean; validated: boolean },
): TransitionCheck {
  if (from === to) return { ok: false, because: 'Já está nesse estado.' };

  if (!TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      because: `De «${STATUS_LABEL[from]}» não se vai direto para «${STATUS_LABEL[to]}».`,
    };
  }

  if (to !== 'proposed' && to !== 'swapped' && to !== 'dropped' && !ctx.approved) {
    return { ok: false, because: 'Falta a sua aprovação da proposta.' };
  }

  if (VALIDATED_STATUSES.includes(to) && !ctx.validated) {
    return { ok: false, because: 'O material ainda não foi validado por você.' };
  }

  return { ok: true };
}

export const nextStatuses = (from: ProposalStatus): readonly ProposalStatus[] => TRANSITIONS[from];

/** Uma peça publicada sem passar por validação é o erro que não pode existir.
 *  A função corre sobre uma linha da base para provar que não existe. */
export function pipelineBreaches(row: {
  status: ProposalStatus;
  approvedAt: string | null;
  validatedAt: string | null;
}): string[] {
  const out: string[] = [];
  if (VALIDATED_STATUSES.includes(row.status) && !row.validatedAt) {
    out.push('Chegou a pronto sem validação humana.');
  }
  if (row.status !== 'proposed' && row.status !== 'swapped' && row.status !== 'dropped' && !row.approvedAt) {
    out.push('Saiu de proposto sem aprovação.');
  }
  return out;
}
