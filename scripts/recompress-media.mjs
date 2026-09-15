/** Reencoda os vídeos que já estão no Storage.
 *
 *  A compressão do upload só corria acima de 20 MB e nenhum reel de celular
 *  chegava lá: os vídeos ficaram guardados como saíram da câmera. Isto trata
 *  dos que já lá estão — o limiar novo só apanha os próximos.
 *
 *  Uso:
 *    npm run media:recompress            # analisa e não toca em nada
 *    npm run media:recompress -- --apply # substitui no Storage
 *
 *  O original de cada vídeo é guardado em .media-backup/ antes de ser
 *  substituído, e o caminho no Storage nunca muda: as páginas publicadas
 *  continuam a apontar para o mesmo endereço.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const BACKUP = '.media-backup';
const TMP = '/tmp/recompress-media';
const BUCKET = 'media';
/** Abaixo disto o reencode não tem nada para ganhar. */
const VALE_A_PENA = 2 * 1024 * 1024;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const auth = { apikey: key, Authorization: `Bearer ${key}` };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const pedir = async (caminho, init) => {
  const r = await fetch(`${url}${caminho}`, { ...init, headers: { ...auth, ...init?.headers } });
  if (!r.ok) throw new Error(`${r.status} ${caminho}: ${(await r.text()).slice(0, 200)}`);
  return r;
};

mkdirSync(BACKUP, { recursive: true });
mkdirSync(TMP, { recursive: true });

const itens = await (
  await pedir('/rest/v1/media_item?select=id,storage_path,title&kind=eq.video')
).json();
console.log(`${itens.length} vídeos na biblioteca.${apply ? '' : ' (análise; nada é escrito)'}\n`);

let antes = 0;
let depois = 0;
const saltados = [];

for (const item of itens) {
  const nome = item.storage_path;
  const entrada = path.join(TMP, `in-${path.basename(nome)}`);
  const saida = path.join(TMP, `out-${path.basename(nome)}.mp4`);

  const bruto = Buffer.from(
    await (await pedir(`/storage/v1/object/${BUCKET}/${nome}`)).arrayBuffer(),
  );
  writeFileSync(entrada, bruto);
  const tamanhoAntes = bruto.length;

  if (tamanhoAntes < VALE_A_PENA) {
    saltados.push(`${nome}: já tem ${mb(tamanhoAntes)}`);
    antes += tamanhoAntes;
    depois += tamanhoAntes;
    continue;
  }

  /* -crf 27 com faststart: o moov fica à cabeça do arquivo, que é o que torna
     barato pedir só os metadados para desenhar a miniatura. */
  const ff = spawnSync('ffmpeg', [
    '-v', 'error', '-i', entrada,
    '-vf', "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-c:v', 'libx264', '-crf', '27', '-preset', 'medium', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', saida, '-y',
  ]);
  if (ff.status !== 0) {
    saltados.push(`${nome}: ffmpeg falhou — ${String(ff.stderr).slice(0, 120)}`);
    antes += tamanhoAntes;
    depois += tamanhoAntes;
    continue;
  }

  const tamanhoDepois = statSync(saida).size;
  antes += tamanhoAntes;

  /* Um reencode que engorda o arquivo não entra: o original fica. */
  if (tamanhoDepois >= tamanhoAntes) {
    saltados.push(`${nome}: reencode ficou maior (${mb(tamanhoDepois)})`);
    depois += tamanhoAntes;
    continue;
  }
  depois += tamanhoDepois;

  const corte = Math.round(100 - (tamanhoDepois * 100) / tamanhoAntes);
  console.log(`${nome}\n  ${mb(tamanhoAntes)} → ${mb(tamanhoDepois)}  (${corte}% menor)`);

  if (!apply) continue;

  /* O original só sai do Storage depois de estar em disco aqui. */
  writeFileSync(path.join(BACKUP, path.basename(nome)), bruto);
  await pedir(`/storage/v1/object/${BUCKET}/${nome}`, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' },
    body: readFileSync(saida),
  });
  console.log('  substituído no Storage; original em ' + path.join(BACKUP, path.basename(nome)));
}

console.log(`\nTotal: ${mb(antes)} → ${mb(depois)} (${Math.round(100 - (depois * 100) / antes)}% menor)`);
if (saltados.length) console.log(`\nNão mexidos:\n  ${saltados.join('\n  ')}`);
if (!apply) console.log('\nNada foi escrito. Repete com --apply para substituir.');
