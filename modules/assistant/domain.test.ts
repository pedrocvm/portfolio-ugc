import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDomain, memoryCandidate, needsConfirmetion, tokens, windowTurns,
} from './domain.ts';

test('acentos não mudam a palavra', () => {
  assert.deepEqual(tokens('Preço e direitos de utilização'), ['preco', 'e', 'direitos', 'de', 'utilizacao']);
});

test('a fronteira é a palavra inteira: «api» não vive dentro de «rápida»', () => {
  assert.equal(tokens('carga rápida').includes('api'), false);
});

test('pergunta do negócio passa', () => {
  assert.equal(classifyDomain('quanto cobro à Cecotec por 3 vídeos?'), 'business_relevant');
  assert.equal(classifyDomain('que marcas estão paradas?'), 'business_relevant');
});

test('futebol não passa', () => {
  assert.equal(classifyDomain('quem ganhou a champions ontem?'), 'off_topic');
});

test('mensagem para a mãe não passa', () => {
  assert.equal(classifyDomain('escreve uma mensagem para a minha mãe'), 'off_topic');
});

test('equipamento é adjacente, não é recusa', () => {
  assert.equal(classifyDomain('que tripé devo comprar?'), 'business_adjacent');
  assert.equal(classifyDomain('que equipamento levo para Lisboa?'), 'business_adjacent');
});

test('fora de tema com uma palavra do negócio ao lado é trabalho', () => {
  // «música no reel» é produção, não entretenimento.
  assert.equal(classifyDomain('que filme uso de referência para o criativo?'), 'business_relevant');
});

test('dentro de uma marca, «e agora?» é do negócio', () => {
  assert.equal(classifyDomain('e agora?'), 'uncertain');
  assert.equal(classifyDomain('e agora?', { hasEntity: true }), 'business_relevant');
});

test('a meio de uma conversa também', () => {
  assert.equal(classifyDomain('e depois disso?', { priorTurns: 3 }), 'business_relevant');
});

test('ações de ler não pedem confirmação; enviar pede', () => {
  assert.equal(needsConfirmetion('get_brand'), false);
  assert.equal(needsConfirmetion('send_email'), true);
  assert.equal(needsConfirmetion('set_pricing_policy'), true);
});

test('a janela salva tudo e envia o fim', () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    content: `m${i}`,
    id: `id${i}`,
  }));
  const w = windowTurns(turns, 12);
  assert.equal(w.recent.length, 12);
  assert.equal(w.needsSummary, true);
  assert.equal(w.summariseThrough, 'id7');
  assert.equal(w.recent[0].content, 'm8');
});

test('conversa curta não precisa de resumo', () => {
  const turns = [{ role: 'user' as const, content: 'olá', id: 'a' }];
  assert.deepEqual(windowTurns(turns, 12), { recent: turns, needsSummary: false, summariseThrough: null });
});

test('cansaço não é regra do negócio', () => {
  assert.equal(memoryCandidate('estou cansada hoje'), null);
});

test('recusar um nicho vira preferência de marca, sem pedir confirmação', () => {
  const m = memoryCandidate('não quero mais trabalhar com skincare');
  assert.equal(m?.type, 'brand_preference');
  assert.equal(m?.needsConfirmetion, false);
});

test('mudar o preço mínimo é crítico e espera por ela', () => {
  const m = memoryCandidate('o meu valor mínimo agora é 180€');
  assert.equal(m?.type, 'pricing_decision');
  assert.equal(m?.needsConfirmetion, true);
});

test('um objetivo declarado é salvo como objetivo', () => {
  assert.equal(memoryCandidate('o meu objetivo é fechar o primeiro cliente pago')?.type, 'goal');
});
