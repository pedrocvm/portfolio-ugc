import assert from 'node:assert/strict';
import test from 'node:test';
import { getIn, setIn } from '../components/dashboard/paths.ts';
import { fit } from './compress.ts';
import { DEFAULT_CONTENT } from './content.ts';
import { hashParts, isPwnedIn } from './hibp.ts';
import { merge } from './merge.ts';

test('merge mantém a origem quando o salvo não tem o campo', () => {
  const out = merge(DEFAULT_CONTENT, { hero: { top: 'Novo' } });
  assert.equal(out.hero.top, 'Novo');
  assert.equal(out.hero.firstName, DEFAULT_CONTENT.hero.firstName);
  assert.equal(out.plans.items.length, DEFAULT_CONTENT.plans.items.length);
});

test('merge descarta chaves desconhecidas', () => {
  const out = merge(DEFAULT_CONTENT, { hero: { top: 'X' }, intruso: 1 });
  assert.ok(!('intruso' in out));
});

test('merge rejeita valores do tipo errado', () => {
  const out = merge(DEFAULT_CONTENT, {
    hero: { top: 42 },
    contact: { phone: null },
    faq: { items: 'nada disto' },
  });
  assert.equal(out.hero.top, DEFAULT_CONTENT.hero.top);
  assert.equal(out.contact.phone, DEFAULT_CONTENT.contact.phone);
  assert.deepEqual(out.faq.items, DEFAULT_CONTENT.faq.items);
});

test('merge normaliza cada item de uma lista pelo modelo', () => {
  const out = merge(DEFAULT_CONTENT, {
    faq: { items: [{ q: 'Só a pergunta' }, { a: 'Só a resposta', lixo: true }] },
  });
  assert.equal(out.faq.items.length, 2);
  assert.equal(out.faq.items[0].q, 'Só a pergunta');
  assert.equal(out.faq.items[0].a, DEFAULT_CONTENT.faq.items[0].a);
  assert.ok(!('lixo' in out.faq.items[1]));
});

test('setIn troca o valor sem tocar no resto', () => {
  const next = setIn(DEFAULT_CONTENT, 'faq.items.1.q', 'Outra pergunta?');
  assert.equal(getIn(next, 'faq.items.1.q'), 'Outra pergunta?');
  assert.equal(
    DEFAULT_CONTENT.faq.items[1].q,
    'Quanto tempo demora?',
    'o objeto original não pode mudar',
  );
  assert.equal(next.faq.items[0], DEFAULT_CONTENT.faq.items[0]);
  assert.ok(Array.isArray(next.faq.items));
});

test('hashParts corta o hash nos cinco primeiros caracteres', () => {
  const { prefix, suffix } = hashParts('password');
  assert.equal(prefix, '5BAA6');
  assert.equal(suffix, '1E4C9B93F3F0682250B6CF8331B7EE68FD8');
});

test('isPwnedIn ignora o acolchoamento de contagem zero', () => {
  const corpo = [
    '0000000000000000000000000000000000A:0',
    '1E4C9B93F3F0682250B6CF8331B7EE68FD8:0',
  ].join('\r\n');
  assert.equal(isPwnedIn(corpo, '1E4C9B93F3F0682250B6CF8331B7EE68FD8'), false);
});

test('isPwnedIn apanha a palavra-passe vazada', () => {
  const corpo = [
    '0000000000000000000000000000000000A:0',
    '1E4C9B93F3F0682250B6CF8331B7EE68FD8:52372427',
  ].join('\r\n');
  assert.equal(isPwnedIn(corpo, '1E4C9B93F3F0682250B6CF8331B7EE68FD8'), true);
  assert.equal(isPwnedIn(corpo, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false);
});

test('merge aceita listas cujo valor de origem é vazio', () => {
  const reel = [{ src: 'https://exemplo/a.jpg' }, { src: 'https://exemplo/b.mp4' }];
  const out = merge(DEFAULT_CONTENT, {
    meet: { niches: [{ name: 'Skincare', reel }] },
  });
  assert.deepEqual(out.meet.niches[0].reel, reel);
  assert.equal(out.meet.niches[0].name, 'Skincare');
});

test('fit encolhe o 4K vertical até 1080 de lado curto', () => {
  assert.deepEqual(fit(2160, 3840), [1080, 1920]);
});

test('fit não amplia o que já é pequeno', () => {
  assert.deepEqual(fit(720, 1280), [720, 1280]);
});

test('fit devolve sempre lados pares', () => {
  const [w, h] = fit(1439, 2559);
  assert.equal(w % 2, 0);
  assert.equal(h % 2, 0);
});

test('fit respeita o lado longo no formato horizontal', () => {
  const [w, h] = fit(3840, 2160);
  assert.ok(w <= 1920 && h <= 1080);
});

test('salvar uma seção não mexe no resto do rascunho', () => {
  /* o que a base tem: vídeos carregados pela editora numa sessão anterior */
  const salvo = merge(DEFAULT_CONTENT, {
    session: {
      takes: [{ label: 'Casa&Decor', n: '01', niche: 'SWEEK', img: 'https://x/v.mp4' }],
    },
  });
  /* o que esta janela mexeu: só o processo */
  const patch = { process: { ...DEFAULT_CONTENT.process, num: '09' } };

  const out = merge(DEFAULT_CONTENT, { ...salvo, ...patch });

  assert.equal(out.process.num, '09');
  assert.deepEqual(out.session.takes, salvo.session.takes);
});
