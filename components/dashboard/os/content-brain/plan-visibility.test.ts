import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** Depois de «Pronta para gravar», a história tem de continuar visível — com os
 *  momentos e o roteiro — e «Ver plano» tem de abrir alguma coisa. Verificado
 *  como texto, pela mesma razão de `guide.test.ts`: o runner não tem DOM. */

const ROOT = path.join(import.meta.dirname, '..', '..', '..', '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

test('o «Pronto para gravar» mostra os momentos e o roteiro, com uma âncora por história', () => {
  const src = ler('components/dashboard/os/content-brain/RecordPane.tsx');
  assert.match(src, /id=\{`story-\$\{r\.id\}`\}/);
  assert.match(src, /<StoryPlan storyId=\{r\.id\} moments=\{r\.moments\} script=\{r\.script\}/);
  const plano = ler('components/dashboard/os/content-brain/StoryPlan.tsx');
  assert.match(plano, /<pre>\{script\}<\/pre>/);
  assert.match(plano, /writeScript\(storyId\)/, 'quem não pediu roteiro no Workshop pode pedi-lo aqui');
});

test('o Banco e o fim do Workshop levam ao plano, não a lugar nenhum', () => {
  assert.match(ler('components/dashboard/os/content-brain/StoryBank.tsx'), /href=\{`\/dashboard\/content\?tab=record#story-\$\{s\.id\}`\}/);
  assert.match(ler('components/dashboard/os/content-brain/StoryWorkshop.tsx'), /href=\{`\/dashboard\/content\?tab=record#story-\$\{storyId\}`\}/);
});

test('«Ver plano» abre a aba onde a ficha existe e remonta o estúdio ao mudar de endereço', () => {
  const src = ler('app/dashboard/(app)/content/page.tsx');
  assert.match(src, /const initial: StudioTab = isStudioTab\(tab\) \? tab : 'record';/);
  assert.match(src, /<ContentStudio\s+key=\{`\$\{tab \?\? ''\}:\$\{idea \?\? ''\}`\}/);
  assert.doesNotMatch(src, /aberta\.status === 'saved'/);
});

test('uma peça que nasceu de uma história herda gancho, roteiro e tomadas da estrutura', () => {
  const src = ler('modules/creator/plan-service.ts');
  assert.match(src, /structure_json, story_id/);
  assert.match(src, /hook: String\(r\.hook \?\? ''\) \|\| plano\.centralPoint \|\| ''/);
  assert.match(src, /shotList: shotList\.length \? shotList : plano\.shots/);
});

test('ver uma publicação abre o embed aqui, e o iframe só nasce ao abrir', () => {
  const ci = ler('components/dashboard/os/content-brain/ContentIntelligence.tsx');
  assert.doesNotMatch(ci, /href=\{p\.permalink\} target="_blank"/);
  assert.match(ci, /<InstagramPeek permalink=\{p\.permalink\}/);
  const peek = ler('components/dashboard/os/content-brain/InstagramPeek.tsx');
  assert.match(peek, /\{aberto \? <iframe src=\{embed\}/);
  assert.match(peek, /<dialog/);
});
