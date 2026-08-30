import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimsFrom, emailDomain, normalizeDomain, normalizeEmail, normalizeHandle,
  normalizeName, resolveBrand, type KnownBrand,
} from './identity.ts';

const brand = (id: string, name: string, ids: [string, string][] = []): KnownBrand => ({
  id,
  normalizedName: normalizeName(name),
  identities: ids.map(([provider, externalId]) => ({ provider, externalId })),
});

test('a normalização de nome tira acentos, espaços e pontuação', () => {
  assert.equal(normalizeName('O Botícário Portugal'), 'oboticarioportugal');
  assert.equal(normalizeName('Ach. Brito'), 'achbrito');
  assert.equal(normalizeName('  UGREEN  '), 'ugreen');
  assert.equal(normalizeName(null), '');
});

test('domínios perdem o www e o esquema', () => {
  assert.equal(normalizeDomain('https://www.orbitkey.com/pages/about'), 'orbitkey.com');
  assert.equal(normalizeDomain('orbitkey.com'), 'orbitkey.com');
  assert.equal(normalizeDomain('não é um domínio'), null);
  assert.equal(normalizeDomain(''), null);
});

test('um domínio de correio pessoal nunca identifica uma marca', () => {
  assert.equal(emailDomain('alguem@gmail.com'), null);
  assert.equal(emailDomain('alguem@hotmail.com'), null);
  assert.equal(emailDomain('alguem@sapo.pt'), null);
  assert.equal(emailDomain('ferino.hendry@orbitkey.com'), 'orbitkey.com');
});

test('endereços inválidos não passam', () => {
  assert.equal(normalizeEmail('sem arroba'), null);
  assert.equal(normalizeEmail('a@b'), null);
  assert.equal(normalizeEmail(' Marketing@UGREEN.com '), 'marketing@ugreen.com');
});

test('handles saem de @, de url e de texto simples', () => {
  assert.equal(normalizeHandle('@carolqueiroz'), 'carolqueiroz');
  assert.equal(normalizeHandle('https://instagram.com/cecotecportugal/'), 'cecotecportugal');
  assert.equal(normalizeHandle('https://www.tiktok.com/@govee'), 'govee');
  assert.equal(normalizeHandle('a'), null);
});

test('as reivindicações não repetem o mesmo identificador', () => {
  const claims = claimsFrom({
    website: 'https://govee.com',
    urls: ['https://www.govee.com/produtos', 'https://instagram.com/govee'],
  });
  const keys = claims.map((c) => `${c.provider}:${c.externalId}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('domain:govee.com'));
  assert.ok(keys.includes('instagram:govee'));
});

test('um identificador que bate é prova: funde', () => {
  const known = [brand('b1', 'Orbitkey', [['email_domain', 'orbitkey.com']])];
  const v = resolveBrand(claimsFrom({ email: 'outra.pessoa@orbitkey.com' }), 'Orbit Key Ltd', known);
  assert.equal(v.kind, 'exact');
  assert.equal(v.kind === 'exact' && v.brandId, 'b1');
});

test('um nome igual sem identificador é candidato, nunca fusão', () => {
  const known = [brand('b1', 'Nanoleaf')];
  const v = resolveBrand([], 'Nanoleaf', known);
  assert.equal(v.kind, 'candidate');
  assert.ok(v.kind === 'candidate' && v.confidence < 1);
});

test('um nome contido noutro é um candidato mais fraco', () => {
  const known = [brand('b1', 'Charabanc Aroma')];
  const v = resolveBrand([], 'Charabanc', known);
  assert.equal(v.kind, 'candidate');
  assert.ok(v.kind === 'candidate' && v.confidence < 0.5);
});

test('nomes curtos não colam a tudo', () => {
  const known = [brand('b1', 'Achilles Sport')];
  assert.equal(resolveBrand([], 'Ach', known).kind, 'none');
});

test('marcas diferentes com o mesmo domínio de agência não se fundem por nome', () => {
  // socialmedia@feeling.pt é a agência, não a Widi Care.
  const known = [brand('b1', 'Widi Care Europe', [['email_domain', 'feeling.pt']])];
  const v = resolveBrand(claimsFrom({ email: 'socialmedia@feeling.pt' }), 'Outra Marca', known);
  // O identificador bate, por isso funde — e é por isso que o backfill
  // deliberadamente não escreve brand.domain a partir de um email.
  assert.equal(v.kind, 'exact');
});

test('sem nada conhecido não há correspondência', () => {
  assert.equal(resolveBrand(claimsFrom({ email: 'x@nova.com' }), 'Nova', []).kind, 'none');
});

test('sem nome nem identificador devolve none', () => {
  assert.equal(resolveBrand([], '', [brand('b1', 'Alguma')]).kind, 'none');
});
