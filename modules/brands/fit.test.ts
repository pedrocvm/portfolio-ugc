import assert from 'node:assert/strict';
import test from 'node:test';
import { FIT_WEIGHTS, bandFor, scoreBrandFit } from './fit.ts';
import { NICHES, guessNiche, isExcludedNiche, prospectableNiches } from './niches.ts';

const strong = {
  paid_maturity: 5, demo_potential: 5, budget_signals: 5, authentic_context: 5,
  economics: 5, recurring_demand: 5, aesthetic: 5, contact_access: 5,
  logistics: 5, portfolio_value: 5,
} as const;

test('os pesos somam 100', () => {
  assert.equal(Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('uma marca tech perfeita chega a 100 e à banda A', () => {
  const r = scoreBrandFit({ nicheId: 'home_tech', ...strong });
  assert.equal(r.score, 100);
  assert.equal(r.band, 'A');
});

test('skincare não recebe bónus de categoria mesmo com tudo o resto perfeito', () => {
  const tech = scoreBrandFit({ nicheId: 'saas', ...strong });
  const beauty = scoreBrandFit({ nicheId: 'beauty', ...strong });
  assert.equal(tech.score - beauty.score, FIT_WEIGHTS.category);
  assert.equal(beauty.excludedNiche, true);
  assert.match(beauty.summary, /fora da estratégia/i);
});

test('haircare cai no mesmo nicho excluído que skincare', () => {
  assert.equal(isExcludedNiche('beauty'), true);
  assert.equal(guessNiche('champô reparador para cabelo')?.id, 'beauty');
  assert.equal(guessNiche('sérum facial anti-idade')?.id, 'beauty');
});

test('skincare e haircare nunca aparecem na lista de prospecção', () => {
  assert.equal(prospectableNiches().some((n) => n.id === 'beauty'), false);
  for (const n of prospectableNiches()) assert.notEqual(n.tier, 'EXCLUDED');
});

test('os cinco nichos P0 são os do posicionamento tech-first', () => {
  const p0 = NICHES.filter((n) => n.tier === 'P0').map((n) => n.id).sort();
  assert.deepEqual(p0, ['apps', 'consumer_tech', 'home_tech', 'pet_tech', 'saas']);
});

test('todos os P0 valem o máximo de categoria', () => {
  for (const n of NICHES.filter((x) => x.tier === 'P0')) assert.equal(n.fit, 5);
});

test('um sinal em falta conta como neutro, não como zero, e é assinalado', () => {
  const r = scoreBrandFit({ nicheId: 'saas' });
  assert.ok(r.unknowns.includes('paid_maturity'));
  assert.ok(r.score > 0, 'desconhecido não pode ser tratado como incompatível');
  const line = r.lines.find((l) => l.criterion === 'paid_maturity')!;
  assert.equal(line.score, 3);
  assert.equal(line.assumed, true);
});

test('a categoria nunca é assumida: vem sempre da política de nichos', () => {
  const r = scoreBrandFit({ nicheId: 'pet_tech', paid_maturity: 0 });
  const line = r.lines.find((l) => l.criterion === 'category')!;
  assert.equal(line.assumed, false);
  assert.equal(line.score, 5);
  assert.match(line.note!, /Pet tech/);
});

test('cada linha explica o seu contributo', () => {
  const r = scoreBrandFit({ nicheId: 'saas', ...strong });
  assert.equal(r.lines.length, Object.keys(FIT_WEIGHTS).length);
  for (const l of r.lines) {
    assert.equal(l.points, Math.round((l.score / 5) * l.weight * 100) / 100);
  }
});

test('as bandas seguem os cortes do briefing', () => {
  assert.equal(bandFor(100), 'A');
  assert.equal(bandFor(85), 'A');
  assert.equal(bandFor(84), 'B');
  assert.equal(bandFor(70), 'B');
  assert.equal(bandFor(69), 'C');
  assert.equal(bandFor(55), 'C');
  assert.equal(bandFor(54), 'low');
  assert.equal(bandFor(40), 'low');
  assert.equal(bandFor(39), 'ignore');
});

test('a versão da política acompanha o resultado', () => {
  const r = scoreBrandFit({ nicheId: 'saas' });
  assert.match(r.policyVersion, /fit-v1\+niche-v1/);
});

test('adivinhar o nicho a partir de texto livre', () => {
  assert.equal(guessNiche('robô aspirador para casa inteligente')?.id, 'home_tech');
  assert.equal(guessNiche('caixa de areia automática para gatos')?.id, 'pet_tech');
  assert.equal(guessNiche('plataforma SaaS de produtividade B2B')?.id, 'saas');
  assert.equal(guessNiche('power bank de carga rápida')?.id, 'consumer_tech');
  assert.equal(guessNiche(''), null, 'sem texto não se adivinha');
  assert.equal(guessNiche('qualquer coisa sem palavras conhecidas'), null);
});

test('um override humano substitui o score sem apagar o cálculo', async () => {
  const { effectiveFit } = await import('./fit.ts');
  const computed = scoreBrandFit({ nicheId: 'beauty', ...strong });
  const withOverride = effectiveFit(computed, {
    score: 90,
    reason: 'Carol quer esta mesmo assim.',
    at: '2026-08-30',
    by: 'carol',
  });
  assert.equal(withOverride.score, 90);
  assert.equal(withOverride.band, 'A');
  assert.equal(withOverride.overridden, true);
  assert.notEqual(computed.score, 90, 'o cálculo original continua intacto');
});
