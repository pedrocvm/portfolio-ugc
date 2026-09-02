import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseFromResearch, classify, domainOf, localPart, mailboxFit, pickOutreachEmail } from './mailcheck.ts';

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

/* ── A caixa certa ────────────────────────────────────────────────────────── */

test('o caso Shopkit: com marketing à vista, não se manda para o suporte', () => {
  // O que aconteceu: o email de marketing está na primeira página do Google e
  // a abordagem saiu para `suporte@`. Os dois passam na verificação de forma e
  // de MX — o que faltava era distinguir a caixa.
  const r = pickOutreachEmail([
    { address: 'suporte@shopkit.com', source: 'website' },
    { address: 'marketing@shopkit.com', source: 'research' },
  ]);
  assert.equal(r.chosen?.address, 'marketing@shopkit.com');
  assert.equal(r.fit, 'target');
  assert.equal(r.alternatives[0]?.address, 'suporte@shopkit.com');
});

test('o suporte perde mesmo quando é a única coisa vista no site', () => {
  // A fonte pesa, mas não o suficiente para pôr uma proposta num ticket.
  const r = pickOutreachEmail([
    { address: 'suporte@marca.pt', source: 'website' },
    { address: 'geral@marca.pt', source: 'guess' },
  ]);
  assert.equal(r.chosen?.address, 'geral@marca.pt');
});

test('cada caixa é classificada pelo departamento, não pela forma', () => {
  assert.equal(mailboxFit('parcerias@marca.pt'), 'target');
  assert.equal(mailboxFit('marketing.pt@marca.com'), 'target');
  assert.equal(mailboxFit('mkt_geral@marca.com'), 'target');
  assert.equal(mailboxFit('comunicação@marca.pt'), 'target');
  assert.equal(mailboxFit('info@marca.pt'), 'front_door');
  assert.equal(mailboxFit('joana.silva@marca.pt'), 'front_door');
  assert.equal(mailboxFit('faturação@marca.pt'), 'wrong_team');
  assert.equal(mailboxFit('rh@marca.pt'), 'wrong_team');
  assert.equal(mailboxFit('noreply@marca.pt'), 'never');
});

test('o que a página diz sobre a caixa desempata', () => {
  // «Para parcerias: ola@marca.pt» — a marca sabe melhor do que o padrão.
  const r = pickOutreachEmail([
    { address: 'info@marca.pt', source: 'website' },
    { address: 'ola@marca.pt', team: 'parcerias e imprensa', source: 'website' },
  ]);
  assert.equal(r.chosen?.address, 'ola@marca.pt');
});

test('uma pessoa vale mais do que a porta da frente e menos do que a equipe', () => {
  assert.equal(
    pickOutreachEmail([
      { address: 'geral@marca.pt', source: 'website' },
      { address: 'joana.silva@marca.pt', source: 'website' },
    ]).chosen?.address,
    'joana.silva@marca.pt',
  );
  assert.equal(
    pickOutreachEmail([
      { address: 'joana.silva@marca.pt', source: 'website' },
      { address: 'marketing@marca.pt', source: 'guess' },
    ]).chosen?.address,
    'marketing@marca.pt',
  );
});

test('sem endereço nenhum não se inventa um', () => {
  assert.equal(pickOutreachEmail([]).chosen, null);
  assert.equal(pickOutreachEmail([{ address: 'isto não é um email' }]).chosen, null);
});

test('a frase diz-lhe se a caixa é a certa ou a possível', () => {
  assert.match(pickOutreachEmail([{ address: 'marketing@m.pt' }]).because, /caixa de quem trata de parcerias/);
  assert.match(pickOutreachEmail([{ address: 'suporte@m.pt' }]).because, /vira ticket/);
  assert.match(pickOutreachEmail([{ address: 'info@m.pt' }]).because, /porta da frente/);
});

test('a escolha é a mesma venha a marca da busca automática ou da manual', () => {
  const r = chooseFromResearch({
    emails: [
      { address: 'suporte@shopkit.com', team: null, where: 'página de contatos do site' },
      { address: 'marketing@shopkit.com', team: null, where: 'resultado do Google' },
    ],
  });
  assert.equal(r.chosen?.address, 'marketing@shopkit.com');
  assert.equal(r.alternatives.length, 1);
  assert.equal(chooseFromResearch(null).chosen, null);
  assert.equal(chooseFromResearch({ emails: [] }).chosen, null);
});
