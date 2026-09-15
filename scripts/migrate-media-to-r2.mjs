/** Migra os arquivos do bucket `media` do Supabase Storage para o Cloudflare
 *  R2, mantendo o mesmo storage_path. Idempotente: pode ser interrompido e
 *  corrido de novo — cada item já migrado (media_item.url já começa pela
 *  base pública do R2) é ignorado.
 *
 *  Uso:
 *    npm run media:migrate-r2            # inventário + análise, nada é escrito
 *    npm run media:migrate-r2 -- --apply # baixa, valida, sobe ao R2 e atualiza o banco
 *
 *  Fluxo por item, na ordem pedida: baixa o original do Supabase uma vez só,
 *  guarda cópia em .media-migration-backup/, gera a versão final (recomprime
 *  vídeo reaproveitando scripts/lib/video-compress.mjs; foto sobe como está),
 *  valida, sobe ao R2 com o mesmo storage_path, só então atualiza
 *  media_item.url. O original nunca é tocado no Supabase.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { r2HeadObject, r2PutObject } from '@/lib/storage/r2';
import { probeVideo, reencodeVideo, VALE_A_PENA } from './lib/video-compress.mjs';

const apply = process.argv.includes('--apply');
const BACKUP = '.media-migration-backup';
const MANIFEST_PATH = '.media-migration-manifest.json';
const TMP = '/tmp/migrate-media-to-r2';
const BUCKET = 'media';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_PUBLIC_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!R2_PUBLIC_BASE) {
  console.error('Falta NEXT_PUBLIC_R2_PUBLIC_BASE_URL.');
  process.exit(1);
}

const auth = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const md5 = (buf) => createHash('md5').update(buf).digest('hex');

mkdirSync(BACKUP, { recursive: true });
mkdirSync(TMP, { recursive: true });

/** Sem isto um 402 no primeiro item vira 34 mensagens iguais em vez de uma
 *  parada clara. */
async function checkStorageAvailable() {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  });
  if (r.status === 402) {
    const body = await r.text().catch(() => '');
    return { ok: false, status: 402, body };
  }
  if (!r.ok) {
    return { ok: false, status: r.status, body: await r.text().catch(() => '') };
  }
  return { ok: true };
}

async function listBucketObjects() {
  const objetos = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`list ${BUCKET}: ${r.status} ${await r.text()}`);
    const page = await r.json();
    objetos.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return objetos;
}

async function fetchMediaItems() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/media_item?select=id,kind,storage_path,url,title&storage_path=not.eq.&storage_path=not.is.null`,
    { headers: auth },
  );
  if (!r.ok) throw new Error(`media_item: ${r.status} ${await r.text()}`);
  return r.json();
}

async function downloadOriginal(storagePath) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, { headers: auth });
  if (r.status === 402) return { ok: false, status: 402 };
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, buffer: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') };
}

function probeImage(caminho) {
  const p = spawnSync('python3', [
    '-c',
    `from PIL import Image; im = Image.open(${JSON.stringify(caminho)}); im.verify(); print(im.size)`,
  ]);
  return p.status === 0;
}

async function updateMediaItemUrl(id, url) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/media_item?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(`update media_item ${id}: ${r.status} ${await r.text()}`);
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { items: {}, orphans: [], missing: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(m) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

async function main() {
  console.log(`Verificando disponibilidade do Storage…`);
  const disponivel = await checkStorageAvailable();
  if (!disponivel.ok) {
    console.error(
      `\nStorage indisponível (HTTP ${disponivel.status}). ${disponivel.body ?? ''}\n` +
        `Nada foi lido nem escrito. Repita depois que a cota resetar (ou apareça outra fonte legítima dos originais).`,
    );
    process.exit(2);
  }
  console.log('Storage acessível.\n');

  const [bucketObjects, mediaItems] = await Promise.all([listBucketObjects(), fetchMediaItems()]);
  const manifest = loadManifest();

  const porPath = new Map(mediaItems.map((m) => [m.storage_path, m]));
  const orphans = bucketObjects.filter((o) => !porPath.has(o.name)).map((o) => o.name);
  const missing = mediaItems.filter(
    (m) => !bucketObjects.some((o) => o.name === m.storage_path),
  );
  manifest.orphans = orphans;
  manifest.missing = missing.map((m) => ({ id: m.id, storage_path: m.storage_path, title: m.title }));

  console.log(`${mediaItems.length} itens com storage_path no banco.`);
  console.log(`${bucketObjects.length} objetos no bucket ${BUCKET}.`);
  if (orphans.length) console.log(`${orphans.length} órfãos no bucket (sem linha em media_item) — preservados, listados no manifest.`);
  if (missing.length) console.log(`${missing.length} linhas sem objeto correspondente — listadas no manifest, não migradas.`);

  const pendentes = mediaItems.filter((m) => !m.url?.startsWith(R2_PUBLIC_BASE));
  const jaMigrados = mediaItems.length - pendentes.length;
  console.log(`${jaMigrados} já migrados (url já aponta para o R2).`);
  console.log(`${pendentes.length} pendentes.${apply ? '' : ' (análise; nada é escrito)'}\n`);

  let ok = 0;
  let falhas = 0;

  for (const item of pendentes) {
    const nome = item.storage_path;
    if (missing.some((m) => m.id === item.id)) continue;

    const baixado = await downloadOriginal(nome);
    if (!baixado.ok) {
      console.log(`${nome}: falhou o download (HTTP ${baixado.status}) — não migrado.`);
      manifest.items[item.id] = { storage_path: nome, kind: item.kind, estadoDaCopia: 'falhou-download', httpStatus: baixado.status };
      falhas++;
      continue;
    }

    const original = baixado.buffer;
    const originalSize = original.length;
    const entrada = path.join(TMP, `in-${path.basename(nome)}`);
    writeFileSync(entrada, original);

    let finalBuffer = original;
    let contentType = baixado.contentType || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg');
    let compressed = false;
    let validation = { ok: false, method: 'nenhuma' };

    if (item.kind === 'video') {
      const antes = probeVideo(entrada);
      if (originalSize > VALE_A_PENA) {
        const saida = path.join(TMP, `out-${path.basename(nome)}.mp4`);
        const reencoded = reencodeVideo(entrada, saida);
        if (reencoded.ok && reencoded.size < originalSize) {
          finalBuffer = readFileSync(saida);
          contentType = 'video/mp4';
          compressed = true;
        }
      }
      const finalPath = compressed ? path.join(TMP, `out-${path.basename(nome)}.mp4`) : entrada;
      const depois = probeVideo(finalPath);
      const duracaoOk = antes && depois && Math.abs(antes.durationSeconds - depois.durationSeconds) < 1;
      const resolucaoOk = depois && depois.width > 0 && depois.height > 0;
      validation = {
        ok: Boolean(duracaoOk && resolucaoOk),
        method: 'ffprobe: duração e resolução',
        antes,
        depois,
      };
    } else {
      const legivel = probeImage(entrada);
      validation = { ok: legivel, method: 'PIL: abre e verifica' };
      if (!compressed) {
        // identidade bit-a-bit garantida — não houve transformação.
        validation.checksumOriginal = md5(original);
        validation.checksumFinal = md5(finalBuffer);
        validation.ok = validation.ok && validation.checksumOriginal === validation.checksumFinal;
      }
    }

    if (!validation.ok) {
      console.log(`${nome}: falhou a validação (${validation.method}) — não migrado.`);
      manifest.items[item.id] = {
        storage_path: nome, kind: item.kind, estadoDaCopia: 'falhou-validacao', originalSize, validation,
      };
      falhas++;
      continue;
    }

    console.log(
      `${nome}: ${mb(originalSize)}${compressed ? ` → ${mb(finalBuffer.length)} (recomprimido)` : ' (sem alteração)'} — validado.`,
    );

    if (!apply) {
      manifest.items[item.id] = {
        storage_path: nome, kind: item.kind, estadoDaCopia: 'analisado', originalSize,
        finalSize: finalBuffer.length, compressed, validation,
      };
      ok++;
      continue;
    }

    /* O original só sai da máquina local depois de validado; o Supabase nunca
       é tocado, e o backup fica antes da escrita no R2. */
    writeFileSync(path.join(BACKUP, path.basename(nome)), original);
    await r2PutObject({ path: nome, body: finalBuffer, contentType });
    const head = await r2HeadObject(nome);
    if (!head.exists || head.size !== finalBuffer.length) {
      console.log(`${nome}: subiu ao R2 mas o HEAD não confirma o tamanho — não atualizei o banco.`);
      manifest.items[item.id] = {
        storage_path: nome, kind: item.kind, estadoDaCopia: 'falhou-confirmacao-r2', originalSize, finalSize: finalBuffer.length,
      };
      falhas++;
      continue;
    }

    const novaUrl = `${R2_PUBLIC_BASE}/${nome}`;
    await updateMediaItemUrl(item.id, novaUrl);
    manifest.items[item.id] = {
      storage_path: nome, kind: item.kind, estadoDaCopia: 'migrado', originalSize,
      finalSize: finalBuffer.length, compressed, validation, url: novaUrl,
    };
    ok++;
    saveManifest(manifest);
  }

  saveManifest(manifest);
  console.log(`\n${ok} ok, ${falhas} falharam, ${jaMigrados} já estavam migrados.`);
  if (!apply) console.log('Nada foi escrito. Repete com --apply para migrar de verdade.');
  if (falhas) process.exitCode = 1;
}

await main();
