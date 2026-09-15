/** Reencode de vídeo compartilhado entre scripts/recompress-media.mjs
 *  (reencoda o que já está no Supabase) e scripts/migrate-media-to-r2.mjs
 *  (reencoda a caminho do R2). Os dois têm de produzir o mesmo arquivo pelos
 *  mesmos parâmetros — duplicar isto era um dia divergir em silêncio. */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';

/** Abaixo disto o reencode não tem nada para ganhar. */
export const VALE_A_PENA = 2 * 1024 * 1024;

/** -crf 27 com faststart: o moov fica à cabeça do arquivo, que é o que torna
 *  barato pedir só os metadados para desenhar a miniatura (VideoThumb). */
export function reencodeVideo(entrada, saida) {
  const ff = spawnSync('ffmpeg', [
    '-v', 'error', '-i', entrada,
    '-vf', "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-c:v', 'libx264', '-crf', '27', '-preset', 'medium', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', saida, '-y',
  ]);
  if (ff.status !== 0) {
    return { ok: false, reason: String(ff.stderr).slice(0, 200) };
  }
  return { ok: true, size: statSync(saida).size };
}

/** Metadados via ffprobe: duração e resolução, para confirmar que o reencode
 *  (ou a simples cópia) não destruiu o vídeo — sem decodificar o arquivo
 *  inteiro. Devolve null se o ffprobe não conseguir ler. */
export function probeVideo(caminho) {
  const p = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
    '-of', 'json', caminho,
  ]);
  if (p.status !== 0) return null;
  try {
    const j = JSON.parse(p.stdout.toString());
    const stream = j.streams?.[0];
    const duration = Number(j.format?.duration);
    if (!stream || !Number.isFinite(duration)) return null;
    return { width: stream.width, height: stream.height, durationSeconds: duration };
  } catch {
    return null;
  }
}
