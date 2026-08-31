/** Mete um documento canónico na base de conhecimento.
 *
 *  Aceita Markdown e PDF. Corta por títulos, porque um título é onde um assunto
 *  começa — cortar por número de caracteres parte uma regra a meio e devolve
 *  metade dela.
 *
 *  Uso:
 *    SUPABASE_SERVICE_ROLE_KEY=... npm run ingest -- \
 *      docs.local/ficheiro.pdf "Título do documento" 90
 *
 *  `npm run ingest` lê o resto do .env.local. Junta `--dry` para ver os pedaços
 *  sem gravar nada.
 *
 *  A autoridade (0-100) é quem ganha quando duas fontes discordam.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
// `--dry` mostra o que seria indexado e não escreve nada. Ver antes de gravar
// é a diferença entre indexar um documento e indexar rodapés.
const dry = args.includes('--dry');
const [file, title, authority = '80'] = args.filter((a) => a !== '--dry');

if (!file || !title) {
  console.error('uso: node scripts/ingest-knowledge.mjs <ficheiro.md|.pdf> "<título>" [autoridade] [--dry]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry) {
  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !key && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`falta ${missing.join(' e ')}`);
    console.error('a service key está em Supabase → Project Settings → API Keys');
    process.exit(1);
  }
}

async function readDocument(path) {
  const bytes = readFileSync(path);
  if (!path.toLowerCase().endsWith('.pdf')) return bytes.toString('utf8');

  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

/** Num PDF, o cabeçalho e o rodapé repetem-se em cada página. Sem isto, cada
 *  pedaço leva «CONFIDENTIAL | v1.0 | 37» colado ao conteúdo. */
function stripRepeatedLines(text) {
  const lines = text.split('\n');
  const counts = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 4 && t.length < 90) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // Uma linha que aparece em mais de um quinto das páginas é cromo de página.
  const pages = Math.max(1, Math.round(lines.length / 45));
  const noise = new Set(
    [...counts.entries()].filter(([, n]) => n >= Math.max(4, pages / 5)).map(([t]) => t),
  );
  return lines
    .filter((l) => !noise.has(l.trim()))
    // A numeração solta que sobra também não é conteúdo.
    .filter((l) => !/^\s*\d{1,3}\s*$/.test(l))
    .join('\n');
}

/** Um título de PDF não traz `#`. Reconhece-se por ser curto, isolado, e em
 *  caixa alta ou numerado. */
const looksLikeHeading = (line) => {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (/^#{1,3}\s+/.test(t)) return true;
  if (/^\d+(\.\d+)*[.)]?\s+\S/.test(t) && t.length < 70) return true;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length > 4 && letters === letters.toUpperCase();
};

function chunk(text) {
  const out = [];
  let heading = '';
  let buffer = [];
  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content.length > 60) out.push({ heading, content: content.slice(0, 3500) });
    buffer = [];
  };

  for (const line of text.split('\n')) {
    if (looksLikeHeading(line)) {
      flush();
      heading = line.replace(/^#{1,3}\s+/, '').trim();
    } else {
      buffer.push(line);
    }
    if (buffer.join('\n').length > 3500) flush();
  }
  flush();
  return out;
}

const raw = await readDocument(file);
const text = stripRepeatedLines(raw);
const checksum = createHash('sha256').update(raw).digest('hex');
const chunks = chunk(text);

if (chunks.length === 0) {
  console.error('não consegui tirar texto deste ficheiro — é um PDF de imagens?');
  process.exit(1);
}

if (dry) {
  console.log(`${title}: ${chunks.length} pedaços, ${text.length} caracteres`);
  console.log(`ruído de página removido: ${raw.length - text.length} caracteres\n`);
  for (const c of chunks.slice(0, 6)) {
    console.log(`— ${c.heading || '(sem título)'}`);
    console.log(`  ${c.content.slice(0, 130).replace(/\s+/g, ' ')}…\n`);
  }
  const semTitulo = chunks.filter((c) => !c.heading).length;
  if (semTitulo) console.log(`${semTitulo} pedaços sem título — o corte por secção não apanhou tudo.`);
  process.exit(0);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: source, error: sourceError } = await db
  .from('knowledge_source')
  .upsert(
    {
      source_type: 'source_of_truth',
      title,
      version: 'v1',
      authority: Number(authority),
      status: 'active',
      checksum,
    },
    { onConflict: 'source_type,title,version' },
  )
  .select('id')
  .single();
if (sourceError) throw sourceError;

// Reindexar substitui: um documento com metade dos pedaços velhos é pior do
// que um documento sem pedaço nenhum.
await db.from('knowledge_chunk').delete().eq('source_id', source.id);

const rows = chunks.map((c, i) => ({
  source_id: source.id,
  ordinal: i,
  heading: c.heading.slice(0, 200),
  content: c.content,
}));

for (let i = 0; i < rows.length; i += 100) {
  const { error } = await db.from('knowledge_chunk').insert(rows.slice(i, i + 100));
  if (error) throw error;
}

console.log(`${title}: ${rows.length} pedaços indexados (${text.length} caracteres)`);
