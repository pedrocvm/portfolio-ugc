import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** Contratos de visibilidade da Produção atual.
 *
 * O fluxo antigo de StoryBank/RecordPane saiu da experiência. O que precisa
 * ficar protegido agora é a continuidade entre uma proposta aprovada, o
 * material para validar e a aba Produção. */

const ROOT = path.join(import.meta.dirname, '..', '..', '..', '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

test('Produção mostra o material para validar e o estoque pronto', () => {
  const src = ler('components/dashboard/os/content-brain/ProductionPane.tsx');
  assert.match(src, /<h2>Para validar<\/h2>/);
  assert.match(src, /<PackView key=\{i\.proposalId\}/);
  assert.match(src, /<h2>Pronto para produzir<\/h2>/);
  assert.match(src, /Nada passa daqui sem você ler/);
});

test('o material só vira validado por ação humana explícita', () => {
  const pack = ler('components/dashboard/os/content-brain/PackView.tsx');
  assert.match(pack, /validateMaterial\(pack\.id\)/);
  assert.match(pack, />\s*Validar\s*</);
  assert.match(pack, /disabled=\{pending \|\| pack\.gaps\.length > 0\}/);
  assert.match(pack, /Validado por você\. Pode gravar\./);
});

test('links antigos de gravação caem em Produção, sem ressuscitar a tela antiga', () => {
  const tabs = ler('components/dashboard/os/studioTabs.ts');
  assert.match(tabs, /record: 'production'/);
  assert.match(tabs, /tests: 'lab'/);

  const page = ler('app/dashboard/(app)/content/page.tsx');
  assert.match(page, /const initial: StudioTab = resolveTab\(tab\);/);
  assert.match(page, /production: \(/);
  assert.doesNotMatch(page, /RecordPane|StoryBank|ContentVault/);
});

test('ver uma publicação abre o embed aqui, e o iframe só nasce ao abrir', () => {
  const ci = ler('components/dashboard/os/content-brain/ContentIntelligence.tsx');
  assert.doesNotMatch(ci, /href=\{p\.permalink\} target="_blank"/);
  assert.match(ci, /<InstagramPeek permalink=\{p\.permalink\}/);
  const peek = ler('components/dashboard/os/content-brain/InstagramPeek.tsx');
  assert.match(peek, /\{aberto \? <iframe src=\{embed\}/);
  assert.match(peek, /<dialog/);
});
