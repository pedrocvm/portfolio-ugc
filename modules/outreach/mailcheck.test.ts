import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, domainOf, localPart } from './mailcheck.ts';

const c = (over: Partial<Parameters<typeof classify>[0]> = {}) =>
  classify({ email: 'marketing@cecotec.es', source: 'website', domainHasMx: true, ...over });

test('um endereço torto é apanhado antes de qualquer rede', () => {
  for (const email of ['sem-arroba', 'a@b', 'a b@c.com', 'a@@b.com', '@nada.com', 'a@dominio']) {
    assert.equal(c({ email }).valid, false, email);
  }
});

test('um endereço normal passa a forma', () => {
  for (const email of ['ana@marca.pt', 'ana.silva@sub.marca.co.uk', 'ana+ugc@marca.com']) {
    assert.equal(c({ email }).valid, true, email);
  }
});

test('domínio sem servidor de email é recusado, e a razão diz porquê', () => {
  const r = c({ domainHasMx: false });
  assert.equal(r.valid, false);
  assert.equal(r.confidence, 'low');
  assert.match(r.reason, /devolvida/);
});

test('não conseguir verificar não é o mesmo que estar errado', () => {
  const r = c({ domainHasMx: null });
  assert.equal(r.valid, true);
  assert.equal(r.confidence, 'unknown');
  assert.doesNotMatch(r.reason, /devolvida|não tem/);
});

test('uma caixa que não responde não vale o envio', () => {
  const r = c({ email: 'noreply@marca.pt' });
  assert.equal(r.valid, false);
  assert.match(r.reason, /não recebe respostas/);
});

test('a origem decide o nível, porque o MX prova o domínio e não a caixa', () => {
  assert.equal(c({ source: 'website' }).confidence, 'high');
  assert.equal(c({ source: 'research' }).confidence, 'medium');
  assert.equal(c({ source: 'guess' }).confidence, 'low');
});

test('um endereço geral é válido, e é assinalado como geral', () => {
  const r = c({ email: 'info@marca.pt' });
  assert.equal(r.valid, true);
  assert.equal(r.roleAccount, true);
  assert.match(r.reason, /geral/);
});

test('uma pessoa não é assinalada como endereço geral', () => {
  assert.equal(c({ email: 'camila@marca.pt' }).roleAccount, false);
});

test('as partes saem certas', () => {
  assert.equal(localPart('Ana.Silva@Marca.PT'), 'ana.silva');
  assert.equal(domainOf('Ana@Marca.PT'), 'marca.pt');
  assert.equal(domainOf('sem-dominio'), null);
});
