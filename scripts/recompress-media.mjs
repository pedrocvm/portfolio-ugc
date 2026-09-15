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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VALE_A_PENA, reencodeVideo } from './lib/video-compress.mjs';

const apply = process.argv.includes('--apply');
const BACKUP = '.media-backup';
const TMP = '/tmp/recompress-media';
const BUCKET = 'media';

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

  const reencoded = reencodeVideo(entrada, saida);
  if (!reencoded.ok) {
    saltados.push(`${nome}: ffmpeg falhou — ${reencoded.reason.slice(0, 120)}`);
    antes += tamanhoAntes;
    depois += tamanhoAntes;
    continue;
  }

  const tamanhoDepois = reencoded.size;
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
