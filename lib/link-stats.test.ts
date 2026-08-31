import assert from 'node:assert/strict';
import test from 'node:test';
import { resumir, type LinkEventRow } from './link-stats.ts';

const AGORA = new Date('2026-08-11T12:00:00.000Z');
const haDias = (n: number) =>
  new Date(AGORA.getTime() - n * 86400000).toISOString();

const ev = (p: Partial<LinkEventRow>): LinkEventRow => ({
  type: 'view',
  target: '',
  referrer: '',
  utm_source: '',
  device: '',
  country: '',
  session: 's',
  created_at: haDias(0),
  ...p,
});

test('resumir separa os tipos e calcula a taxa de toque', () => {
  const r = resumir(
    [
      ev({ type: 'view' }),
      ev({ type: 'view' }),
      ev({ type: 'view' }),
      ev({ type: 'view' }),
      ev({ type: 'click', target: 'Portfólio' }),
      ev({ type: 'contact', target: 'whatsapp' }),
      ev({ type: 'share' }),
    ],
    7,
    AGORA,
  );
  assert.equal(r.visitas, 4);
  assert.equal(r.cliques, 1);
  assert.equal(r.contatos, 1);
  assert.equal(r.partilhas, 1);
  /* dois toques em quatro visitas */
  assert.equal(r.taxa, 50);
});

test('resumir deixa de fora o que é mais velho que o período', () => {
  const r = resumir(
    [ev({ created_at: haDias(2) }), ev({ created_at: haDias(40) })],
    7,
    AGORA,
  );
  assert.equal(r.visitas, 1);
});

test('a grelha traz todos os dias do período, mesmo os vazios', () => {
  const r = resumir([ev({ created_at: haDias(1) })], 7, AGORA);
  assert.equal(r.porDia.length, 7);
  assert.equal(
    r.porDia.reduce((s, d) => s + d.visitas, 0),
    1,
  );
  assert.ok(r.porDia.some((d) => d.visitas === 0));
});

test('a campanha manda sobre o site de origem, e sem nenhum é direto', () => {
  const r = resumir(
    [
      ev({ utm_source: 'instagram', referrer: 'l.instagram.com' }),
      ev({ referrer: 'google.com' }),
      ev({}),
    ],
    7,
    AGORA,
  );
  assert.deepEqual(
    r.origens.map((o) => o.nome).sort(),
    ['Direto', 'google.com', 'instagram'],
  );
});

test('as ligações mais tocadas vêm à frente', () => {
  const r = resumir(
    [
      ev({ type: 'click', target: 'Pacotes' }),
      ev({ type: 'click', target: 'Portfólio' }),
      ev({ type: 'click', target: 'Pacotes' }),
      ev({ type: 'contact', target: 'whatsapp' }),
    ],
    7,
    AGORA,
  );
  assert.deepEqual(r.ligacoes[0], { nome: 'Pacotes', total: 2 });
  assert.equal(r.ligacoes.length, 3);
});

test('sem visitas a taxa é zero e não NaN', () => {
  const r = resumir([ev({ type: 'click', target: 'x' })], 7, AGORA);
  assert.equal(r.taxa, 0);
});
