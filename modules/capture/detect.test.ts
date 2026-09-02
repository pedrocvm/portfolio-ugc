import assert from 'node:assert/strict';
import test from 'node:test';
import { detectKind } from './detect';

/** Eram sete botões — Link, Conversa, Perfil, Produto, Briefing, Print, Outro —
 *  e escolher entre eles é uma decisão técnica que não é dela. Estes testes
 *  existem para o palpite ser bom o suficiente para o seletor ficar escondido. */

test('um link do Instagram é um perfil, não um site qualquer', () => {
  const g = detectKind('https://www.instagram.com/meliabraga/');
  assert.equal(g.kind, 'profile');
  assert.match(g.label, /Instagram/);
  assert.ok(g.sure);
});

test('cada rede é reconhecida pelo nome dela', () => {
  assert.match(detectKind('https://tiktok.com/@marca').label, /TikTok/);
  assert.match(detectKind('https://www.linkedin.com/company/x').label, /LinkedIn/);
  assert.match(detectKind('https://youtube.com/@canal').label, /YouTube/);
});

test('um site normal é um site, e diz qual', () => {
  const g = detectKind('https://www.meliabraga.com');
  assert.equal(g.kind, 'url');
  assert.equal(g.label, 'o site meliabraga.com');
});

/** «Esta marca interessa» e «este é o produto que me mandaram» são coisas
 *  diferentes, e o caminho do endereço chega para as separar. */
test('um endereço de loja é um produto', () => {
  assert.equal(detectKind('https://loja.pt/produto/aspirador-x').kind, 'product');
  assert.equal(detectKind('https://shop.example.com/products/mop-2000').kind, 'product');
});

test('um email colado é uma conversa', () => {
  const email = [
    'De: julia@cecotec.pt',
    'Para: carol@exemplo.pt',
    'Assunto: Colaboração',
    '',
    'Olá Carolina, gostávamos de falar com você.',
  ].join('\n');
  const g = detectKind(email);
  assert.equal(g.kind, 'conversation');
  assert.ok(g.sure);
});

test('texto citado com «>» também é conversa', () => {
  assert.equal(detectKind('> Olá Carol\n\nRespondo já.').kind, 'conversation');
});

/** Duas palavras de trabalho e tamanho a sério. Uma frase com «campanha» lá
 *  dentro é uma nota, não um briefing — e tratá-la como briefing manda o
 *  sistema extrair entregáveis de uma linha. */
test('um briefing precisa de vocabulário e de corpo', () => {
  const longo =
    'Campanha de Verão. Entregáveis: 3 vídeos de 30s para Instagram Reels. ' +
    'O deadline é 30 de Setembro e as guidelines estão no moodboard anexo. ' +
    'Precisamos de mostrar o produto em uso, em ambiente exterior, com luz natural. ' +
    'O tom deve ser leve e próximo, sem parecer publicidade tradicional.';
  assert.equal(detectKind(longo).kind, 'brief');
});

test('uma frase com «campanha» é só uma nota', () => {
  const g = detectKind('Falar com a Cecotec sobre a campanha de Outubro.');
  assert.equal(g.kind, 'text');
  assert.equal(g.sure, false);
});

test('acentos não mudam o palpite', () => {
  const semAcentos =
    'Campanha de Verao. Entregaveis: 3 videos de 30s para Instagram Reels. ' +
    'O deadline e 30 de Setembro e as guidelines estao no moodboard anexo. ' +
    'Precisamos de mostrar o produto em uso, em ambiente exterior, com luz natural. ' +
    'O tom deve ser leve e proximo, sem parecer publicidade tradicional.';
  assert.equal(detectKind(semAcentos).kind, 'brief');
});

test('um arquivo de imagem é sempre um print, seja qual for o texto', () => {
  const g = detectKind('https://instagram.com/marca', 'conversa.png');
  assert.equal(g.kind, 'screenshot');
  assert.ok(g.sure);
});

test('um endereço no meio de texto não faz o texto virar link sozinho', () => {
  const g = detectKind('Vê isto https://marca.pt e diz o que achas');
  assert.equal(g.kind, 'url');
});

test('vazio não rebenta nem finge saber', () => {
  const g = detectKind('   ');
  assert.equal(g.kind, 'text');
  assert.equal(g.sure, false);
});

test('um endereço partido não deita o detector abaixo', () => {
  assert.doesNotThrow(() => detectKind('http://'));
  assert.doesNotThrow(() => detectKind('https://[[['));
});
