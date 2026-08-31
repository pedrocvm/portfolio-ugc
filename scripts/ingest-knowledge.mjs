/** Mete um documento canónico na base de conhecimento.
 *
 *  Corta por títulos de Markdown, porque um título é onde um assunto começa —
 *  cortar por número de caracteres parte uma regra a meio e devolve metade.
 *
 *  Uso: node scripts/ingest-knowledge.mjs <ficheiro.md> "Título" <autoridade>
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [file, title, authority = '80'] = process.argv.slice(2);
if (!file || !title) {
  console.error('uso: node scripts/ingest-knowledge.mjs <ficheiro> "<título>" [autoridade]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const checksum = createHash('sha256').update(text).digest('hex');

const chunks = [];
let heading = '';
let buffer = [];
const flush = () => {
  const content = buffer.join('\n').trim();
  if (content.length > 40) chunks.push({ heading, content });
  buffer = [];
};
for (const line of text.split('\n')) {
  const m = /^#{1,3}\s+(.*)$/.exec(line);
  if (m) {
    flush();
    heading = m[1].trim();
  } else {
    buffer.push(line);
  }
  // Um capítulo enorme continua a ser cortado, senão vai inteiro para o prompt.
  if (buffer.join('\n').length > 3500) flush();
}
flush();

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: source, error: sourceError } = await db
  .from('knowledge_source')
  .upsert(
    { source_type: 'source_of_truth', title, version: 'v1', authority: Number(authority), status: 'active', checksum },
    { onConflict: 'source_type,title,version' },
  )
  .select('id')
  .single();
if (sourceError) throw sourceError;

await db.from('knowledge_chunk').delete().eq('source_id', source.id);

const rows = chunks.map((c, i) => ({ source_id: source.id, ordinal: i, heading: c.heading, content: c.content }));
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await db.from('knowledge_chunk').insert(rows.slice(i, i + 100));
  if (error) throw error;
}

console.log(`${title}: ${rows.length} pedaços indexados`);
