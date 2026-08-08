export const STAGES = [
  { id: 'abordada', label: 'Abordada' },
  { id: 'respondeu', label: 'Respondeu' },
  { id: 'proposta', label: 'Proposta enviada' },
  { id: 'negociacao', label: 'Em negociação' },
  { id: 'fechada', label: 'Fechada' },
  { id: 'perdida', label: 'Perdida' },
] as const;

export const CHANNELS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'E-mail' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'outro', label: 'Outro' },
] as const;

export type Stage = (typeof STAGES)[number]['id'];
export type Channel = (typeof CHANNELS)[number]['id'];

export type Brand = {
  id: string;
  name: string;
  instagram: string;
  contact: string;
  channel: Channel;
  approached_on: string | null;
  stage: Stage;
  next_step: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export const stageLabel = (id: string) =>
  STAGES.find((s) => s.id === id)?.label ?? id;

export const channelLabel = (id: string) =>
  CHANNELS.find((c) => c.id === id)?.label ?? id;

/** Etapas que já não estão em jogo: saem da contagem do funil ativo. */
export const CLOSED: Stage[] = ['fechada', 'perdida'];
