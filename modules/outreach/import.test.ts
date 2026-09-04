import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IMPORT_LIMITS,
  bucketOf,
  classifyResolution,
  importKeyOf,
  parseBrandList,
  parseLine,
  planFor,
  progressText,
  readableName,
  summarize,
  summaryText,
  type DedupEvidence,
} from './import.ts';

/* ── O caso real: dez hotéis separados à mão ─────────────────────────────── */

const LISTA = `Six Senses Douro Valley
https://www.instagram.com/quintadapacheca/
Torel Avantgarde - Porto
https://www.hotelx.pt
@vidagoapalace
Quinta da Pacheca
tiktok.com/@octanthotel
https://www.linkedin.com/company/pestana-hotel-group/
Casa de São Lourenço, Manteigas
`;

test('a lista colada vira marcas, uma por linha', () => {
  const { items, ignored } = parseBrandList(LISTA);
  assert.equal(ignored.length, 0, `linhas ignoradas: ${ignored.join(' | ')}`);
  // Nove e não oito: «Quinta da Pacheca» aparece por nome e por Instagram, e
  // as duas linhas não têm identificador em comum. Fundi-las aqui seria fundir
  // por parecença — quem as junta é a resolução de identidade, com prova.
  assert.equal(items.length, 9, items.map((i) => i.detectedName).join(' | '));
});

test('cada forma de entrada é reconhecida pelo que é', () => {
  const tipos = Object.fromEntries(
    parseBrandList(LISTA).items.map((i) => [i.detectedName.toLowerCase(), i.inputType]),
  );
  assert.equal(tipos['six senses douro valley'], 'name');
  assert.equal(tipos['quintadapacheca'], 'instagram');
  assert.equal(tipos['torel avantgarde'], 'name');
  assert.equal(tipos['hotelx'], 'domain');
  assert.equal(tipos['vidagoapalace'], 'instagram');
  assert.equal(tipos['octanthotel'], 'tiktok');
  assert.equal(tipos['pestana Hotel Group'.toLowerCase()], 'linkedin');
});

test('o mesmo hotel escrito de duas maneiras entra uma vez', () => {
  // «Quinta da Pacheca» por nome e o Instagram dela são a mesma marca para
  // quem lê, mas não têm identificador comum: só a resolução de identidade os
  // funde. O que este teste trava é o contrário — a mesma chave duas vezes.
  const r = parseBrandList('hotelx.pt\nhttps://www.hotelx.pt/quartos\nHOTELX.PT');
  assert.equal(r.items.length, 1);
  assert.equal(r.duplicates, 2);
});

test('o domínio nacional é pista de país, e o @ não é pista de nada', () => {
  assert.equal(parseLine('https://www.hotelx.pt')?.countryHint, 'Portugal');
  assert.equal(parseLine('pousadadojuncal.com.br')?.countryHint, 'Brasil');
  assert.equal(parseLine('@vidagoapalace')?.countryHint, null);
});

test('a cidade colada ao nome só entra quando é mesmo uma cidade', () => {
  assert.equal(parseLine('Torel Avantgarde - Porto')?.cityHint, 'Porto');
  assert.equal(parseLine('Casa de São Lourenço, Manteigas')?.cityHint, null);
  assert.equal(parseLine('Casa de São Lourenço, Manteigas')?.detectedName, 'Casa de São Lourenço, Manteigas');
  // «Lda» não é cidade: inventar uma pista manda a pesquisa para o lugar errado.
  assert.equal(parseLine('Quinta da Pacheca - Lda')?.cityHint, null);
});

test('numeração, marcadores e aspas da cópia não entram no nome', () => {
  const { items } = parseBrandList('1. Six Senses\n- Torel Avantgarde\n• «Quinta da Pacheca»');
  assert.deepEqual(items.map((i) => i.detectedName), ['Six Senses', 'Torel Avantgarde', 'Quinta da Pacheca']);
});

test('um nome com o site colado à frente dá as duas coisas', () => {
  const c = parseLine('Quinta da Pacheca https://quintadapacheca.com');
  assert.equal(c?.detectedName, 'Quinta da Pacheca');
  assert.equal(c?.detectedDomain, 'quintadapacheca.com');
});

test('vários nomes na mesma linha partem-se; uma morada não', () => {
  assert.equal(parseBrandList('Six Senses, Quinta da Pacheca, Torel Avantgarde').items.length, 3);
  assert.equal(parseBrandList('Hotel X, Rua das Flores 12, Porto').items.length, 1);
});

test('linhas sem marca nenhuma contam-se em vez de desaparecerem', () => {
  const { items, ignored } = parseBrandList('Six Senses\n---\n\n42\nTorel');
  assert.equal(items.length, 2);
  assert.deepEqual(ignored, ['---', '42']);
});

test('a chave do lote é prova, e o nome é a última hipótese', () => {
  assert.equal(importKeyOf(parseLine('https://hotelx.pt')!), 'domain:hotelx.pt');
  assert.equal(importKeyOf(parseLine('@vidagoapalace')!), 'instagram:vidagoapalace');
  assert.equal(importKeyOf(parseLine('Six Senses Douro Valley')!), 'name:sixsensesdourovalley');
});

test('o nome legível não inventa cortes onde não há', () => {
  assert.equal(readableName('quinta-da-pacheca'), 'Quinta da Pacheca');
  assert.equal(readableName('quintadapacheca'), 'Quintadapacheca');
});

test('o lote é artesanal, não infraestrutura de massa', () => {
  assert.equal(IMPORT_LIMITS.max, 25);
});

/* ── A intenção explícita ganha ──────────────────────────────────────────── */

test('um hotel entra na mesma, sem passar por nicho prioritário nenhum', () => {
  // Este fluxo não tem portão de relevância nem de nicho: se ela colou, analisa.
  // O que existe é classificação de relação, e um hotel novo é NEW_COLD.
  const r = classifyResolution(base());
  assert.equal(r.resolution, 'NEW_COLD');
  assert.equal(planFor(r.resolution), 'cold');
});

/* ── Deduplicação e histórico ────────────────────────────────────────────── */

const base = (over: Partial<DedupEvidence> = {}): DedupEvidence => ({
  identityCertain: true,
  suppressed: false,
  brandFound: false,
  opportunityStage: null,
  outreachSent: false,
  gmail: { checked: true, found: false, theyReplied: false, waitingReply: false },
  ...over,
});

test('identidade por confirmar ganha a tudo o resto', () => {
  const r = classifyResolution(base({ identityCertain: false, opportunityStage: 'won', suppressed: true }));
  assert.equal(r.resolution, 'IDENTITY_UNCERTAIN');
  assert.equal(planFor(r.resolution), 'none');
});

test('quem está na lista de não contatar não leva email nenhum', () => {
  const r = classifyResolution(base({ suppressed: true, brandFound: true }));
  assert.equal(r.resolution, 'SUPPRESSED');
  assert.equal(planFor(r.resolution), 'none');
});

test('uma conversa anterior no Gmail impede o primeiro contato', () => {
  // A marca pode ter sido abordada ANTES de o CarolOS existir: o CRM não sabe,
  // o Gmail sabe.
  const r = classifyResolution(base({ gmail: { checked: true, found: true, theyReplied: false, waitingReply: false } }));
  assert.equal(r.resolution, 'ALREADY_CONTACTED');
  assert.equal(planFor(r.resolution), 'reengage');
});

test('se eles responderam, a conversa é deles e não se abre outra', () => {
  const r = classifyResolution(base({ gmail: { checked: true, found: true, theyReplied: true, waitingReply: false } }));
  assert.equal(r.resolution, 'ACTIVE_NEGOTIATION');
  assert.equal(planFor(r.resolution), 'none');
});

test('cada etapa da oportunidade dá a relação certa', () => {
  const casos: [string, string][] = [
    ['won', 'CLIENT'],
    ['negotiation', 'ACTIVE_NEGOTIATION'],
    ['proposal', 'ACTIVE_NEGOTIATION'],
    ['replied', 'ACTIVE_NEGOTIATION'],
    ['nurture', 'NURTURE'],
    ['lost', 'REENGAGE'],
    ['qualified', 'ALREADY_IN_CRM_NOT_CONTACTED'],
  ];
  for (const [stage, esperado] of casos) {
    assert.equal(classifyResolution(base({ opportunityStage: stage, brandFound: true })).resolution, esperado, stage);
  }
});

test('abordada e sem resposta é reabordagem, não primeiro contato', () => {
  const r = classifyResolution(
    base({ opportunityStage: 'outreach', brandFound: true, outreachSent: true }),
  );
  assert.equal(r.resolution, 'WAITING_REPLY');
  assert.equal(planFor(r.resolution), 'reengage');
});

test('no CRM mas nunca abordada continua a levar um primeiro contato', () => {
  const r = classifyResolution(base({ brandFound: true, opportunityStage: 'discovered' }));
  assert.equal(r.resolution, 'ALREADY_IN_CRM_NOT_CONTACTED');
  assert.equal(planFor(r.resolution), 'cold');
});

/* ── O resumo ────────────────────────────────────────────────────────────── */

test('o resumo conta cada marca uma vez só', () => {
  const s = summarize([
    { status: 'ready', resolution: 'NEW_COLD', contactEmail: 'a@a.pt' },
    { status: 'ready', resolution: 'NEW_COLD', contactEmail: 'b@b.pt' },
    // Já abordada conta como «já tinha conversa» mesmo com o email escrito:
    // o que ela precisa saber é que não é um primeiro contato.
    { status: 'ready', resolution: 'ALREADY_CONTACTED', contactEmail: 'c@c.pt' },
    { status: 'researched', resolution: 'NEW_COLD', contactEmail: null },
    { status: 'needs_review', resolution: 'IDENTITY_UNCERTAIN', contactEmail: null },
    { status: 'rejected', resolution: 'SUPPRESSED', contactEmail: null },
    { status: 'failed', resolution: null, contactEmail: null },
  ]);
  assert.equal(s.total, 7);
  assert.equal(s.ready, 2);
  assert.equal(s.already, 1);
  assert.equal(s.no_contact, 1);
  assert.equal(s.review, 1);
  assert.equal(s.suppressed, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.ready + s.already + s.no_contact + s.review + s.suppressed + s.failed, s.total);
});

test('uma marca sem email escrito e sem contato não passa por pronta', () => {
  assert.equal(bucketOf({ status: 'researched', resolution: 'NEW_COLD', contactEmail: null }), 'no_contact');
});

test('a frase do fim diz o que aconteceu', () => {
  const texto = summaryText(
    summarize([
      ...Array.from({ length: 7 }, () => ({ status: 'ready', resolution: 'NEW_COLD', contactEmail: 'a@a.pt' })),
      { status: 'ready', resolution: 'ALREADY_CONTACTED', contactEmail: 'b@b.pt' },
      { status: 'researched', resolution: 'NEW_COLD', contactEmail: null },
      { status: 'needs_review', resolution: 'NEW_COLD', contactEmail: 'c@c.pt' },
    ]),
  );
  assert.match(texto, /10 marcas analisadas/);
  assert.match(texto, /7 prontas para abordagem/);
  assert.match(texto, /1 já tinha conversa/);
  assert.match(texto, /1 sem contato confiável/);
});

test('o progresso conta marcas, não inventa percentagem', () => {
  assert.equal(progressText(5, 10), 'Pesquisando 6 de 10');
  assert.equal(progressText(0, 10), 'Pesquisando 1 de 10');
  assert.equal(progressText(10, 10), 'Terminando');
  assert.equal(progressText(0, 0), 'Pesquisando suas marcas');
});
