import 'server-only';

import { createHash } from 'node:crypto';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { extractReferenceMedia, referenceMediaAvailable } from '@/modules/ai/reference-media';
import { buildReferenceContext } from '@/modules/content-brain/saved-reference-context';
import {
  MAX_ASSET_BYTES, MAX_TOTAL_BYTES, REFERENCE_BUCKET,
  type MediaEvidence, type SavedReference,
} from './domain';
import { savedReferencePrompt, validateAnalysisContext } from './prompt';
import {
  claimReference, finishReference, getReferenceSettings,
  listPendingReferenceIds, listRecentReferenceContent, listReferencePillars,
} from './service';

async function readAssets(reference: SavedReference) {
  const db = supabaseService();
  const output: Array<{ bytes: Uint8Array; mimeType: string }> = [];
  let total = 0;
  // Bounded and sequential to avoid several large files in flight at once.
  for (const asset of reference.assets) {
    if (!asset.path.startsWith(`${reference.id}/`)) throw new Error('invalid_asset');
    if (asset.size > MAX_ASSET_BYTES) throw new Error('asset_too_large');
    const { data, error } = await db.storage.from(REFERENCE_BUCKET).download(asset.path);
    if (error || !data) throw new Error('asset_unavailable');
    total += data.size;
    if (data.size > MAX_ASSET_BYTES || total > MAX_TOTAL_BYTES || data.size !== asset.size) {
      throw new Error('invalid_asset_size');
    }
    output.push({ bytes: new Uint8Array(await data.arrayBuffer()), mimeType: asset.mimeType });
  }
  return output;
}

/** Called only after an authenticated import or an authenticated CMS request.
 * The database lease makes concurrent deliveries and delayed workers harmless. */
export async function processReference(id: string): Promise<void> {
  if (process.env.CAROLOS_REFERENCES_ENABLED === 'false') return;
  const claim = await claimReference(id);
  if (!claim) return;
  const { reference, lease } = claim;
  let evidence: MediaEvidence = {
    transcript: reference.transcript,
    transcriptStatus: reference.transcriptStatus === 'pending' ? 'unavailable' : reference.transcriptStatus,
    visualDescription: reference.visualDescription,
    onScreenText: reference.onScreenText,
    limitations: reference.mediaLimitations ?? [],
  };
  let transcriptSource = reference.transcriptSource;
  try {
    // Re-analyzing the current context reuses observed evidence. It does not
    // retranscribe an already checked source or require a second download.
    const needsMedia = reference.assets.length > 0 && (
      reference.transcriptStatus === 'pending' ||
      (!reference.visualDescription.trim() && !reference.onScreenText.trim() &&
        reference.transcriptSource !== 'gemini' && reference.transcriptStatus !== 'silent')
    );
    if (needsMedia) {
      if (!referenceMediaAvailable()) {
        evidence.limitations.push('A leitura de áudio e imagem precisa ser ativada. A análise usa apenas o texto que você enviou.');
      } else {
        const observed = await extractReferenceMedia(await readAssets(reference));
        // A transcript explicitly corrected by the creator is authoritative.
        evidence = reference.transcriptSource === 'manual' && reference.transcript.trim()
          ? { ...observed, transcript: reference.transcript, transcriptStatus: 'transcribed' }
          : observed;
        if (reference.transcriptSource !== 'manual' && observed.transcript.trim()) transcriptSource = 'gemini';
      }
    }
    if (!reference.assets.length && !evidence.visualDescription && !evidence.transcript) {
      evidence.limitations.push('O arquivo original ainda não foi enviado. A legenda sozinha não permite conferir a fala e a edição.');
    }

    const hasEvidence = Boolean(
      reference.caption.trim() || evidence.transcript.trim() ||
      evidence.visualDescription.trim() || evidence.onScreenText.trim(),
    );
    if (!hasEvidence) {
      await finishReference(id, lease, {
        status: 'needs_input', transcriptStatus: evidence.transcriptStatus,
        transcript: evidence.transcript, transcriptSource,
        visualDescription: evidence.visualDescription, onScreenText: evidence.onScreenText,
        mediaLimitations: evidence.limitations,
        lastError: evidence.transcriptStatus === 'silent'
          ? 'O arquivo não tem fala nem informação visual suficiente. Envie uma descrição ou outro material.'
          : 'Envie o vídeo, as imagens ou a legenda para analisar esta referência.',
      });
      return;
    }

    const [settings, pillars, recentContent] = await Promise.all([
      getReferenceSettings(), listReferencePillars(), listRecentReferenceContent(20),
    ]);
    const context = buildReferenceContext({ realityNotes: settings.realityNotes, pillars, recentContent });
    const contextHash = createHash('sha256').update(JSON.stringify(context)).digest('hex');
    const result = await runPrompt(savedReferencePrompt, {
      context,
      evidence: {
        sourceUrl: reference.sourceUrl, mediaKind: reference.mediaKind,
        creatorHandle: reference.creatorHandle, caption: reference.caption,
        transcript: evidence.transcript, transcriptStatus: evidence.transcriptStatus,
        visualDescription: evidence.visualDescription, onScreenText: evidence.onScreenText,
        notes: reference.notes,
      },
      mediaLimitations: evidence.limitations,
    }, {
      entityType: 'saved_reference', entityId: id, cache: true, timeoutMs: 100_000,
      policyVersions: { context: context.version },
      evidenceRefs: [{ url: reference.sourceUrl, transcriptSource, contextHash }],
    });
    if (!result.ok) {
      await finishReference(id, lease, {
        status: 'failed', transcript: evidence.transcript, transcriptSource,
        transcriptStatus: evidence.transcriptStatus,
        visualDescription: evidence.visualDescription, onScreenText: evidence.onScreenText,
        mediaLimitations: evidence.limitations,
        lastError: result.code === 'not_configured'
          ? 'A análise automática precisa ser ativada. Seu material continua salvo.'
          : 'Não foi possível concluir a análise agora. Seu material continua salvo para tentar novamente.',
      });
      return;
    }
    let analysis = validateAnalysisContext(result.output, context);
    analysis = { ...analysis, limitations: [...new Set([...evidence.limitations, ...analysis.limitations])].slice(0, 15) };
    const hasOriginal = Boolean(evidence.transcript.trim() || evidence.visualDescription.trim() || evidence.onScreenText.trim() || evidence.transcriptStatus === 'silent');
    await finishReference(id, lease, {
      status: hasOriginal ? 'ready' : 'needs_input', analysis,
      transcript: evidence.transcript, transcriptSource, transcriptStatus: evidence.transcriptStatus,
      visualDescription: evidence.visualDescription, onScreenText: evidence.onScreenText,
      mediaLimitations: evidence.limitations,
      lastError: hasOriginal ? null : 'A análise está baseada na legenda. Envie a mídia para conferir a fala e as imagens.',
      contextHash, processedAt: new Date().toISOString(),
    });
    // The private original remains available to check the transcript. It is
    // removed by the explicit delete action, independently of calendar drafts.
  } catch {
    // Provider errors may contain URLs or credential-bearing request details.
    // Only a stable, actionable message is persisted or exposed to clients.
    await finishReference(id, lease, {
      status: 'failed',
      transcript: evidence.transcript, transcriptSource,
      transcriptStatus: evidence.transcriptStatus,
      visualDescription: evidence.visualDescription, onScreenText: evidence.onScreenText,
      mediaLimitations: evidence.limitations,
      lastError: 'Não foi possível ler ou analisar o material. Tente novamente ou envie outro arquivo.',
    });
  }
}

export async function processPendingReferences(limit = 2): Promise<void> {
  if (process.env.CAROLOS_REFERENCES_ENABLED === 'false') return;
  const ids = await listPendingReferenceIds(Math.max(1, Math.min(limit, 2)));
  await Promise.allSettled(ids.map(processReference));
}
