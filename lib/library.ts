export type MediaKind = 'video' | 'photo';

export type MediaItem = {
  id: string;
  kind: MediaKind;
  url: string;
  storage_path: string;
  niche: string;
  title: string;
  created_at: string;
};

export const KIND_LABEL: Record<MediaKind, string> = {
  video: 'Vídeo',
  photo: 'Foto',
};
