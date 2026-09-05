/** Transcrição de áudio, atrás de uma interface.
 *
 *  O áudio é entrada de primeira classe: ela fala, o CarolOS estrutura. Mas o
 *  Content Brain não pode ficar acoplado a um fornecedor — por isso há um
 *  `TranscriptionProvider` e uma variável de ambiente, não uma chamada ao
 *  Gemini no meio do serviço.
 *
 *  A Web Speech API não serve como fonte de verdade: é inconsistente entre
 *  browsers e não existe no Safari de iOS da mesma forma. O que se grava é o
 *  ficheiro; quem transcreve é o servidor.
 *
 *  Server-only. */

import 'server-only';

import { supabaseService } from '@/lib/supabase/service';

export type TranscriptionResult =
  | { ok: true; text: string; provider: string }
  | { ok: false; error: string; retryable: boolean };

export type TranscriptionProvider = {
  id: string;
  transcribe: (audio: { bytes: Uint8Array; mimeType: string }) => Promise<TranscriptionResult>;
};

export const MAX_AUDIO_SECONDS = Number(process.env.CONTENT_AUDIO_MAX_SECONDS ?? 600);
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** O provedor configurado, ou nada. `disabled` é um estado legítimo: a captura
 *  por texto continua a funcionar e ela pode colar o que quiser. */
export function transcriptionProvider(): TranscriptionProvider | null {
  const escolhido = process.env.CONTENT_TRANSCRIPTION_PROVIDER ?? 'gemini';
  if (escolhido === 'disabled') return null;
  if (escolhido === 'gemini') return geminiProvider();
  return null;
}

export const transcriptionAvailable = () => transcriptionProvider() !== null;

/** Gemini multimodal. Já está instalado e lê áudio; não há razão para trazer
 *  outra dependência para isto. */
function geminiProvider(): TranscriptionProvider | null {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY_2 ||
    process.env.GOOGLE_GENAI_API_KEY;
  if (!key) return null;

  return {
    id: 'gemini',
    async transcribe({ bytes, mimeType }) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: key });
        const model = process.env.CONTENT_TRANSCRIPTION_MODEL ?? 'gemini-flash-lite-latest';

        const res = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    'Transcreve este áudio em português do Brasil, literalmente. ' +
                    'Não resumas, não corrijas a gramática dela, não acrescentes nada. ' +
                    'Se houver partes inaudíveis, escreve [inaudível]. Devolve só a transcrição.',
                },
                { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } },
              ],
            },
          ],
        });

        const texto = (res.text ?? '').trim();
        if (!texto) return { ok: false, error: 'A transcrição voltou vazia.', retryable: true };
        return { ok: true, text: texto, provider: 'gemini' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha na transcrição.';
        // 429/503 são temporários e vale a pena repetir; o resto não.
        const retryable = /429|503|overload|unavailable|rate/i.test(message);
        return { ok: false, error: message.slice(0, 200), retryable };
      }
    },
  };
}

/** Transcreve um áudio já no bucket privado e grava o resultado na história.
 *
 *  Se falhar, o áudio fica onde está — dentro da retenção — para ela poder
 *  tentar de novo ou escrever à mão. Apagar um áudio por causa de um 503 seria
 *  perder o relato dela. */
export async function transcribeStoryAudio(storyId: string): Promise<TranscriptionResult> {
  const provider = transcriptionProvider();
  if (!provider) {
    return { ok: false, error: 'A transcrição não está configurada. Você pode escrever o que aconteceu.', retryable: false };
  }

  const db = supabaseService();
  const { data: story } = await db.from('creator_story').select('id, audio_path').eq('id', storyId).maybeSingle();
  if (!story?.audio_path) return { ok: false, error: 'Não encontrei o áudio.', retryable: false };

  const { data: file, error } = await db.storage.from('story-audio').download(story.audio_path);
  if (error || !file) return { ok: false, error: 'Não consegui ler o áudio guardado.', retryable: true };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: 'O áudio é grande demais. Tenta um mais curto.', retryable: false };
  }

  const r = await provider.transcribe({ bytes, mimeType: file.type || 'audio/webm' });
  if (!r.ok) return r;

  await db.from('creator_story').update({ transcript: r.text }).eq('id', storyId);
  return r;
}

/** Extensão pelo `contentType` que o `MediaRecorder` do browser escolheu.
 *
 *  Cada browser escolhe um codec diferente e guardá-lo é o que permite
 *  reproduzir e transcrever mais tarde. */
export function audioExtension(contentType: string): string {
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('mpeg')) return 'mp3';
  return 'bin';
}
