import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { publicMediaUrl } from './media.ts';

const ROOT = path.join(import.meta.dirname, '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

test('publicMediaUrl monta o endereço a partir do storage_path', () => {
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = 'https://media.carolqueiroz.pt';
  assert.equal(
    publicMediaUrl('123-foto.jpg'),
    'https://media.carolqueiroz.pt/123-foto.jpg',
  );
});

test('publicMediaUrl não duplica a barra quando a base termina com uma', () => {
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = 'https://media.carolqueiroz.pt/';
  assert.equal(
    publicMediaUrl('a.mp4'),
    'https://media.carolqueiroz.pt/a.mp4',
  );
});

test('publicMediaUrl recusa montar endereço sem a base configurada', () => {
  const antes = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  assert.throws(() => publicMediaUrl('a.jpg'));
  if (antes !== undefined) process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = antes;
});

/* ── Guarda de regressão: o upload e a remoção não podem voltar a falar
   direto com o Supabase Storage a partir do navegador ou do servidor. Um
   rollback acidental para o bucket antigo tem de quebrar um destes. ── */

test('MediaField não fala mais direto com o Supabase Storage', () => {
  const src = ler('components/dashboard/MediaField.tsx');
  assert.doesNotMatch(src, /supabaseBrowser/, 'voltou a importar o cliente do navegador');
  assert.doesNotMatch(src, /\.storage\.from\(/, 'voltou a chamar o Storage direto do cliente');
  assert.match(src, /\/api\/media\/upload/, 'devia pedir a URL assinada à rota do servidor');
});

test('removeMedia apaga do R2, não do Supabase Storage', () => {
  const src = ler('app/dashboard/library-actions.ts');
  assert.doesNotMatch(
    src,
    /supabase\.storage\.from\('media'\)\.remove/,
    'voltou a apagar direto no bucket do Supabase',
  );
  assert.match(src, /r2DeleteObject/, 'devia apagar pelo cliente do R2');
});

test('a rota de upload exige sessão antes de assinar qualquer URL', () => {
  const src = ler('app/api/media/upload/route.ts');
  assert.match(src, /currentUser\(\)/);
  assert.match(src, /status: 401/);
});

test('a rota de upload valida tipo e tamanho antes de assinar', () => {
  const src = ler('app/api/media/upload/route.ts');
  assert.match(src, /image\/|video\//);
  assert.match(src, /MAX_PICK/);
});

test('as credenciais do R2 nunca ganham prefixo NEXT_PUBLIC_', () => {
  const src = ler('lib/storage/r2.ts');
  for (const nome of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    assert.doesNotMatch(
      src,
      new RegExp(`NEXT_PUBLIC_${nome}`),
      `${nome} não pode ter variante pública`,
    );
  }
  assert.match(src, /import 'server-only'/, 'módulo com credencial de escrita tem de ser server-only');
});
