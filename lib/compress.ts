/** Reencoda o vídeo no browser antes de subir. O Storage recusa acima de
 *  50 MB e um reel de telemóvel passa disso à vontade — comprimindo primeiro,
 *  o ficheiro grande nunca sai do telemóvel e não há nada para apagar depois. */

const MAX_SHORT = 1080;
const MAX_LONG = 1920;
const BITRATE = 2_500_000;
const FPS = 30;

/** mp4 primeiro: é o que o iPhone grava e o que toca em todo o lado. */
const TYPES = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];

const pickType = () =>
  typeof MediaRecorder === 'undefined'
    ? undefined
    : TYPES.find((t) => MediaRecorder.isTypeSupported(t));

/** Encoders H.264 recusam lados ímpares. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function fit(w: number, h: number) {
  const scale = Math.min(
    1,
    MAX_SHORT / Math.min(w, h),
    MAX_LONG / Math.max(w, h),
  );
  return [even(w * scale), even(h * scale)] as const;
}

/** Devolve o original sempre que comprimir falha ou não compensa: pior que um
 *  vídeo pesado é um vídeo que desaparece. */
export async function compressVideo(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const type = pickType();
  if (!type) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((ok, fail) => {
      video.onloadedmetadata = () => ok();
      video.onerror = () => fail(new Error('metadata'));
    });

    const [w, h] = fit(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    const stream = canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: BITRATE,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((ok) => {
      rec.onstop = () => ok();
    });

    /* ponytail: o som fica de fora porque todos os <video> do site tocam em
       mudo. Se algum dia tocar com som, é preciso juntar a faixa de áudio de
       videoEl.captureStream() ao stream do canvas. */
    rec.start();
    await video.play();

    let frame = 0;
    let last = -1;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      const pct = video.duration
        ? Math.round((video.currentTime / video.duration) * 100)
        : 0;
      if (pct !== last) {
        last = pct;
        onProgress?.(pct / 100);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((ok) => {
      video.onended = () => ok();
    });
    cancelAnimationFrame(frame);
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());

    const blob = new Blob(chunks, { type: rec.mimeType });
    if (!blob.size || blob.size >= file.size) return file;

    const ext = rec.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const name = `${file.name.replace(/\.[^.]+$/, '')}.${ext}`;
    return new File([blob], name, { type: blob.type });
  } catch {
    return file;
  } finally {
    video.pause();
    video.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
