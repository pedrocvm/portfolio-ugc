import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';

/** Arquivos no chat.
 *
 *  Dois modos, de propósito: um print de uma DM serve esta conversa e morre com
 *  ela; um contrato pode passar a fonte de verdade. Tornar tudo conhecimento
 *  institucional enche a base de ruído e faz o assistente citar coisas que
 *  ninguém quis canonizar. */

export const MAX_BYTES = 10 * 1024 * 1024;

/** Lista fechada: o que o Claude lê, e nada mais. Um arquivo que o modelo não
 *  entende só serve para ocupar espaço privado. */
const ACCEPTED: Record<string, 'image' | 'pdf' | 'text'> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'text',
};

export const kindFor = (mediaType: string) => ACCEPTED[mediaType] ?? null;

/** O nome vem do disco de outra pessoa: pode trazer barras, `..`, ou nada. */
export function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'arquivo';
  const clean = base.replace(/[^\w.\- ]+/g, '').trim().slice(0, 120);
  return clean || 'arquivo';
}

export type StoredAttachment = {
  id: string;
  kind: 'image' | 'pdf' | 'text';
  mediaType: string;
  fileName: string;
  byteSize: number;
  storagePath: string;
};

export async function storeAttachment(input: {
  threadId: string;
  file: File;
  mode: 'chat' | 'knowledge';
}): Promise<StoredAttachment | { error: string }> {
  const kind = kindFor(input.file.type);
  if (!kind) return { error: `Não sei ler ${input.file.type || 'este tipo de arquivo'}.` };
  if (input.file.size > MAX_BYTES) return { error: 'Arquivo acima de 10 MB.' };
  if (input.file.size === 0) return { error: 'Arquivo vazio.' };

  const db = await supabaseServer();
  const name = safeName(input.file.name);
  // O caminho leva a conversa: assim apagar uma conversa sabe o que apagar, e
  // dois arquivos com o mesmo nome não se pisam.
  const path = `${input.threadId}/${crypto.randomUUID()}-${name}`;

  const { error: upload } = await db.storage
    .from('assistant')
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (upload) return { error: `Não consegui salvar o arquivo: ${upload.message}` };

  const { data, error } = await db
    .from('assistant_attachment')
    .insert({
      thread_id: input.threadId,
      kind,
      media_type: input.file.type,
      file_name: name,
      byte_size: input.file.size,
      storage_path: path,
      mode: input.mode,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    // Sem linha, o arquivo fica órfão no balde. Limpa-se já.
    await db.storage.from('assistant').remove([path]);
    return { error: 'Não consegui registar o arquivo.' };
  }

  return { id: data.id, kind, mediaType: input.file.type, fileName: name, byteSize: input.file.size, storagePath: path };
}

/** Traz os arquivos para o formato que a Messages API entende.
 *
 *  Texto vai como texto — mandar um CSV como base64 seria pagar tokens por
 *  ruído. Imagem e PDF vão em base64, que é o que o modelo lê nativamente:
 *  fazer OCR à parte quando o modelo vê seria trabalho a dobrar e pior. */
export async function loadForModel(attachmentIds: string[]): Promise<
  { id: string; kind: 'image' | 'pdf' | 'text'; mediaType: string; fileName: string; data: string }[]
> {
  if (attachmentIds.length === 0) return [];
  const db = await supabaseServer();

  const { data: rows } = await db
    .from('assistant_attachment')
    .select('id, kind, media_type, file_name, storage_path')
    .in('id', attachmentIds.slice(0, 6));

  const out = [];
  for (const row of rows ?? []) {
    const { data: blob } = await db.storage.from('assistant').download(row.storage_path);
    if (!blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    out.push({
      id: row.id,
      kind: row.kind as 'image' | 'pdf' | 'text',
      mediaType: row.media_type,
      fileName: row.file_name,
      data: row.kind === 'text' ? buffer.toString('utf8').slice(0, 40000) : buffer.toString('base64'),
    });
  }
  return out;
}

export async function threadAttachments(threadId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('assistant_attachment')
    .select('id, kind, file_name, byte_size, mode, created_at')
    .eq('thread_id', threadId)
    .order('created_at');
  return data ?? [];
}

/** Promover um arquivo a fonte de verdade é uma decisão, não um efeito de o
 *  ter arrastado para o chat. */
export async function promoteToKnowledge(attachmentId: string, title: string) {
  const db = await supabaseServer();
  const { data: att } = await db
    .from('assistant_attachment')
    .select('id, kind, storage_path, file_name')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!att) return { error: 'Arquivo não encontrado.' };
  if (att.kind !== 'text') return { error: 'Por agora só indexo texto e Markdown.' };

  const { data: blob } = await db.storage.from('assistant').download(att.storage_path);
  if (!blob) return { error: 'Não consegui ler o arquivo.' };
  const text = await blob.text();

  const { data: source, error } = await db
    .from('knowledge_source')
    .upsert(
      { source_type: 'uploaded_document', title: title || att.file_name, version: 'v1', authority: 60, status: 'active', storage_path: att.storage_path },
      { onConflict: 'source_type,title,version' },
    )
    .select('id')
    .maybeSingle();
  if (error || !source) return { error: 'Não consegui criar a fonte.' };

  await db.from('knowledge_chunk').delete().eq('source_id', source.id);
  const chunks = chunkText(text);
  if (chunks.length) {
    await db.from('knowledge_chunk').insert(
      chunks.map((c, i) => ({ source_id: source.id, ordinal: i, heading: c.heading, content: c.content })),
    );
  }
  await db.from('assistant_attachment').update({ mode: 'knowledge', knowledge_source_id: source.id }).eq('id', attachmentId);
  return { ok: true, chunks: chunks.length };
}

/** Corta por título, porque um título é onde um assunto começa. Cortar por
 *  número de caracteres parte uma regra a meio e devolve metade dela. */
export function chunkText(text: string): { heading: string; content: string }[] {
  const out: { heading: string; content: string }[] = [];
  let heading = '';
  let buffer: string[] = [];
  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content.length > 40) out.push({ heading, content: content.slice(0, 3500) });
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
    if (buffer.join('\n').length > 3500) flush();
  }
  flush();
  return out;
}
