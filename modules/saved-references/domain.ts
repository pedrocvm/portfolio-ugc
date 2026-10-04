import { z } from 'zod';
import { EMPTY_SCRIPT, serializeScript } from '@/modules/content-board/domain';

export const REFERENCE_BUCKET = 'saved-reference-media';
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
export const MAX_ASSETS = 10;
export const POLL_SECONDS = 300;
export const REFERENCE_STATUSES = ['queued', 'processing', 'needs_input', 'ready', 'failed'] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];
export const STATUS_LABELS: Record<ReferenceStatus, string> = {
  queued: 'Na fila', processing: 'Analisando', needs_input: 'Precisa de material',
  ready: 'Analisada', failed: 'Tentar novamente',
};
export const MEDIA_KINDS = ['reel', 'carousel', 'image', 'unknown'] as const;
export const ZONES = ['Z1', 'Z2', 'Z3', 'Z4'] as const;
export type ReferenceZone = (typeof ZONES)[number];
export const ZONE_LABELS: Record<ReferenceZone, string> = {
  Z1: 'Atração', Z2: 'Retenção', Z3: 'Conexão', Z4: 'Comunidade',
};
export const ASSET_MIMES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png',
  'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg',
] as const;

/** Only a concrete Instagram post is accepted. Credentials, arbitrary hosts,
 * redirects and tracking parameters never become a server download target. */
export function canonicalInstagramUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?$/);
    return match ? `https://www.instagram.com/p/${match[1]}/` : null;
  } catch { return null; }
}

export const assetSpecSchema = z.object({
  mimeType: z.enum(ASSET_MIMES),
  size: z.number().int().positive().max(MAX_ASSET_BYTES),
}).strict();
export type AssetSpec = z.infer<typeof assetSpecSchema>;
export type StoredAsset = AssetSpec & { path: string };
export type UploadTarget = StoredAsset & { index: number; signedUrl: string; token: string };

export const intakeSchema = z.object({
  sourceUrl: z.string().max(2048).refine((v) => canonicalInstagramUrl(v) !== null, 'Use o link de um post ou Reel do Instagram.').transform((v) => canonicalInstagramUrl(v)!),
  externalId: z.string().regex(/^\d{1,40}$/).optional(),
  collectionName: z.string().trim().min(1).max(100).default('Referências'),
  mediaKind: z.enum(MEDIA_KINDS).default('unknown'),
  creatorHandle: z.string().trim().max(100).default(''),
  title: z.string().trim().max(200).default(''),
  caption: z.string().max(30000).default(''),
  transcript: z.string().max(60000).default(''),
  notes: z.string().max(6000).default(''),
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  assets: z.array(assetSpecSchema).max(MAX_ASSETS).default([]),
}).strict().refine((v) => v.assets.reduce((n, a) => n + a.size, 0) <= MAX_TOTAL_BYTES, 'Os arquivos juntos devem ter até 80 MB.');
export type ReferenceIntake = z.infer<typeof intakeSchema>;

export const mediaEvidenceSchema = z.object({
  transcript: z.string().max(60000),
  transcriptStatus: z.enum(['transcribed', 'silent', 'unavailable']),
  visualDescription: z.string().max(14000),
  onScreenText: z.string().max(20000),
  limitations: z.array(z.string().max(1500)).max(15),
}).strict();
export type MediaEvidence = z.infer<typeof mediaEvidenceSchema>;

export const analysisSchema = z.object({
  title: z.string().min(1).max(200),
  explanation: z.string().min(1).max(5000),
  hook: z.string().max(2000),
  structure: z.array(z.string().max(1500)).max(12),
  whyItWorks: z.string().max(3000),
  transferableElements: z.array(z.string().max(1500)).max(10),
  adaptation: z.object({
    pillarId: z.string().nullable(),
    subject: z.string().min(1).max(240),
    zone: z.enum(ZONES).nullable(),
    format: z.string().max(100),
    angle: z.string().max(3000),
    hook: z.string().max(1000),
    outline: z.array(z.string().max(2000)).max(12),
    recordingPlan: z.array(z.string().max(1500)).max(10),
    effort: z.string().max(1200),
    whyItFits: z.string().max(3000),
    whatToAvoid: z.array(z.string().max(1000)).max(10),
    needsConfirmation: z.array(z.string().max(1000)).max(10),
  }).strict(),
  limitations: z.array(z.string().max(1500)).max(15),
}).strict();
export type ReferenceAnalysis = z.infer<typeof analysisSchema>;

export type SavedReference = {
  id: string; sourceUrl: string; externalId: string | null; collectionName: string;
  mediaKind: (typeof MEDIA_KINDS)[number]; creatorHandle: string; title: string;
  caption: string; transcript: string; transcriptSource: 'manual' | 'gemini' | null;
  transcriptStatus: 'pending' | 'transcribed' | 'silent' | 'unavailable';
  visualDescription: string; onScreenText: string; mediaLimitations: string[]; notes: string;
  status: ReferenceStatus; analysis: ReferenceAnalysis | null; assets: StoredAsset[];
  pendingAssets: StoredAsset[]; uploadBatchId: string | null;
  lastError: string | null; attempts: number; createdAt: string; updatedAt: string;
  publishedAt: string | null; processedAt: string | null; contextHash: string | null;
  contentBoardItemId: string | null; connectionId: string | null;
};

export type ReferenceConnection = {
  id: string; collectionName: string; enabled: boolean; tokenPrefix: string;
  lastSeenAt: string | null; lastSyncAt: string | null; lastError: string | null;
  createdAt: string; pollSeconds: number;
};
export type ReferenceSettings = { realityNotes: string; updatedAt: string | null };
export type ReferenceScreen = {
  references: SavedReference[]; connection: ReferenceConnection | null;
  settings: ReferenceSettings; aiAvailable: boolean; transcriptionAvailable: boolean;
  total?: number; page?: number; pageSize?: number; collections?: string[];
};
export type IntakeResult = { id: string; duplicate: boolean; uploads: UploadTarget[]; uploadBatchId?: string | null };

export const draftSchema = z.object({
  referenceId: z.uuid(), pillarId: z.uuid(), subject: z.string().trim().min(1).max(240),
  zone: z.enum(ZONES), format: z.string().trim().min(1).max(100),
  script: z.string().max(40000), scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => { const d = new Date(`${v}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, 'Escolha uma data válida.'),
}).strict();
export type ReferenceDraft = z.infer<typeof draftSchema>;

export function connectionState(connection: ReferenceConnection | null, now = Date.now()) {
  if (!connection) return 'unconfigured' as const;
  if (!connection.enabled) return 'paused' as const;
  if (connection.lastError) return 'error' as const;
  if (!connection.lastSeenAt) return 'waiting' as const;
  const seenAt = Date.parse(connection.lastSeenAt);
  if (!Number.isFinite(seenAt) || seenAt > now + 60_000) return 'offline' as const;
  return now - seenAt > connection.pollSeconds * 3 * 1000
    ? 'offline' as const : 'connected' as const;
}

export function draftFromAnalysis(reference: Pick<SavedReference, 'analysis' | 'sourceUrl'>) {
  const a = reference.analysis?.adaptation;
  if (!a) return '';
  return serializeScript({
    ...EMPTY_SCRIPT,
    angle: a.angle,
    hook: a.hook,
    body: [...a.outline, 'Referência original', reference.sourceUrl].join('\n\n'),
    execution: a.recordingPlan.join('\n\n'),
    gate: a.needsConfirmation.join('\n\n'),
  });
}
