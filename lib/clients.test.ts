import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClients, toCents } from './clients.ts';
import type { Brand } from './brands.ts';
import type { DocRow } from './documents.ts';

const marca = (p: Partial<Brand>): Brand => ({
  id: 'b1',
  name: 'Marca',
  instagram: '',
  contact: '',
  channel: 'instagram',
  approached_on: null,
  stage: 'fechada',
  next_step: '',
  notes: '',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...p,
});

const doc = (p: Partial<DocRow>): DocRow => ({
  id: 'd1',
  kind: 'contract',
  title: 'Contrato',
  data: {},
  created_at: '2026-02-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
  ...p,
});

test('toCents lê os formatos que ela escreve à mão', () => {
  assert.equal(toCents('1500'), 150000);
  assert.equal(toCents('1500,50'), 150050);
  assert.equal(toCents('1.500'), 150000);
  assert.equal(toCents('1.500,5'), 150050);
  assert.equal(toCents('1,500.00'), 150000);
  assert.equal(toCents(' 250 € '), 25000);
  assert.equal(toCents(''), null);
  assert.equal(toCents('a combinar'), null);
});

test('só as marcas fechadas viram clientes', () => {
  const clientes = buildClients(
    [
      marca({ id: 'b1', name: 'Alma', stage: 'fechada' }),
      marca({ id: 'b2', name: 'Bravo', stage: 'negociacao' }),
    ],
    [],
  );
  assert.deepEqual(
    clientes.map((c) => c.brand.id),
    ['b1'],
  );
});

test('os documentos colam ao cliente pelo nome, sem acento nem caixa', () => {
  const [cliente] = buildClients(
    [marca({ name: 'Água Viva' })],
    [
      doc({ id: 'd1', kind: 'contract', data: { clientName: 'agua viva', price: '900' } }),
      doc({ id: 'd2', kind: 'proposal', data: { brand: 'ÁGUA VIVA', price: '400' } }),
      doc({ id: 'd3', kind: 'usage', data: { brand: 'Outra', fee: '100' } }),
    ],
  );
  assert.deepEqual(
    cliente.works.map((w) => w.id).sort(),
    ['d1', 'd2'],
  );
});

test('o nome do documento não tem de ser o nome inteiro da marca', () => {
  const [cliente] = buildClients(
    [marca({ name: 'Charabanc Aroma' })],
    [
      doc({ id: 'd1', kind: 'usage', data: { brand: 'Charabanc', fee: '120' } }),
      doc({ id: 'd2', kind: 'usage', data: { brand: 'Alma', fee: '60' } }),
    ],
  );
  assert.deepEqual(
    cliente.works.map((w) => w.id),
    ['d1'],
  );
  assert.equal(cliente.billedCents, 12000);
});

test('a faturação soma contratos e licenças, e deixa a proposta de fora', () => {
  const [cliente] = buildClients(
    [marca({ name: 'Alma' })],
    [
      doc({ id: 'd1', kind: 'contract', data: { clientName: 'Alma', price: '1.200,50' } }),
      doc({ id: 'd2', kind: 'usage', data: { brand: 'Alma', fee: '75' } }),
      doc({ id: 'd3', kind: 'proposal', data: { brand: 'Alma', price: '9999' } }),
    ],
  );
  assert.equal(cliente.billedCents, 127550);
});

test('o trabalho mais recente manda na ordem dos clientes', () => {
  const clientes = buildClients(
    [marca({ id: 'b1', name: 'Alma' }), marca({ id: 'b2', name: 'Bravo' })],
    [
      doc({ id: 'd1', data: { clientName: 'Alma', date: '2026-03-01' } }),
      doc({ id: 'd2', data: { clientName: 'Bravo', date: '2026-07-09' } }),
    ],
  );
  assert.deepEqual(
    clientes.map((c) => c.brand.id),
    ['b2', 'b1'],
  );
});
