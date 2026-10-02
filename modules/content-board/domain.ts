export const PILLAR_KEYS = ['ugc_income', 'braga', 'a_fundo', 'personal'] as const;
export type ContentPillar = (typeof PILLAR_KEYS)[number];

export const CONTENT_PILLARS: readonly { value: ContentPillar; label: string }[] = [
  { value: 'ugc_income', label: 'UGC como fonte de renda' },
  { value: 'braga', label: 'Braga' },
  { value: 'a_fundo', label: 'A fundo' },
  { value: 'personal', label: 'Casa, rotina e pessoal' },
] as const;

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
  pillar: ContentPillar;
  format: string;
  subject: string;
  script: string;
  scheduledFor: string;
  stage: ContentStage;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export const pillarLabel = (pillar: ContentPillar) =>
  CONTENT_PILLARS.find((item) => item.value === pillar)?.label ?? pillar;

export const stageLabel = (stage: ContentStage) =>
  CONTENT_STAGES.find((item) => item.value === stage)?.label ?? stage;
