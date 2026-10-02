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
