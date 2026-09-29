import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** O contrato das telas da estratégia de conteúdo, verificado na fonte.
 *
 *  O runner não tem DOM — é a mesma razão de `guide.test.ts` e
 *  `plan-visibility.test.ts`. O que se prova aqui é o contrato: que a tela
 *  abre no sítio certo, que as três ações existem, que o estado vazio diz
 *  alguma coisa, e que a linguagem interna não vaza para ela. */

const ROOT = path.join(import.meta.dirname, '..', '..', '..', '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = ler('app/dashboard/(app)/content/page.tsx');
const TABS = ler('components/dashboard/os/studioTabs.ts');
const WEEK = ler('components/dashboard/os/content-brain/WeekPane.tsx');
const MAP = ler('components/dashboard/os/content-brain/MapPane.tsx');
const PROD = ler('components/dashboard/os/content-brain/ProductionPane.tsx');
const PACK = ler('components/dashboard/os/content-brain/PackView.tsx');
const LAB = ler('components/dashboard/os/content-brain/LabPane.tsx');
const COMMUNITY = ler('components/dashboard/os/content-brain/Community.tsx');
const OUTCOMES = ler('components/dashboard/os/content-brain/ObjectiveOutcomes.tsx');
const CSS = ler('app/dashboard/content-brain.css');

const TODAS = [WEEK, MAP, PROD, PACK, LAB, COMMUNITY, OUTCOMES];

/* ── Arquitetura de informação ────────────────────────────────────────────── */

test('cinco destinos, e a homepage é a Semana', () => {
  assert.match(TABS, /\['week', 'map', 'production', 'lab', 'audit'\]/);
  assert.match(TABS, /resolveTab = \(v: string \| undefined\): StudioTab =>\s*\n?\s*isStudioTab\(v\) \? v : \(LEGACY\[v \?\? ''\] \?\? 'week'\)/);
  // Referências e aprendizados não são destinos próprios.
  assert.doesNotMatch(TABS, /'references'|'learnings'/);
});

test('a Semana abre em propostas, não em calendário nem em gráficos', () => {
  assert.match(PAGE, /week:\s*semana\s*\?\s*\(/);
  assert.match(WEEK, /<h2>Propostas<\/h2>/);
  // Nenhum gráfico na homepage do Conteúdo.
  assert.doesNotMatch(WEEK, /AuditChart|<svg|osBars/);
});

/* ── As três ações ────────────────────────────────────────────────────────── */

test('Aprovar, Quero ajustar e Trocar existem, e ajustar não reabre tudo', () => {
  assert.match(WEEK, />\s*Aprovar\s*</);
  assert.match(WEEK, />\s*Quero ajustar\s*</);
  assert.match(WEEK, />\s*Trocar\s*</);
  // O ajuste é por campo: ela escolhe o que quer mudar.
  assert.match(WEEK, /function Adjust\(/);
  assert.match(WEEK, /field: AdjustableField/);
  assert.match(WEEK, /\{ id: 'objective', label: 'Objetivo' \}/);
});

test('«por que agora» está à vista, e as razões abrem por baixo', () => {
  assert.match(WEEK, /Por que agora/);
  assert.match(WEEK, /De onde veio/);
  assert.match(WEEK, /className="cbEvidence"/);
});

test('trocar sem alternativa diz que não há, em vez de inventar uma', () => {
  assert.match(WEEK, /Não encontrei outra proposta com razão para entrar agora/);
});

/* ── Estados vazios, falha e espera ───────────────────────────────────────── */

test('cada tela tem estado vazio com frase, e nenhuma fica em branco', () => {
  assert.match(WEEK, /A semana ainda não foi montada/);
  assert.match(WEEK, /Montar a semana/);
  assert.match(PROD, /Nada à sua espera/);
  assert.match(PROD, /Ainda não há duas peças compatíveis/);
  assert.match(LAB, /Nenhuma referência salva ainda/);
  assert.match(LAB, /Nenhuma creator no Radar/);
  assert.match(COMMUNITY, /Ainda não há comentários nesta janela/);
  assert.match(OUTCOMES, /Ainda não há publicações com objetivo registrado/);
});

test('há sinal de espera e caminho para a falha em todas as telas com ação', () => {
  for (const [nome, src] of [['WeekPane', WEEK], ['MapPane', MAP], ['ProductionPane', PROD], ['PackView', PACK], ['LabPane', LAB]] as const) {
    assert.match(src, /<Spinner \/>/, `${nome} sem sinal de espera`);
    assert.match(src, /className="osWarn"/, `${nome} não mostra a falha`);
  }
});

test('a página não rebenta quando uma leitura falha', () => {
  assert.match(PAGE, /currentWeek\(\)\.catch\(\(\) => null\)/);
  assert.match(PAGE, /Não consegui ler a semana agora/);
  assert.match(PAGE, /Não consegui ler o mapa agora/);
  assert.match(PAGE, /Não consegui ler o laboratório agora/);
});

/* ── Validação humana ─────────────────────────────────────────────────────── */

test('validar fica desligado enquanto houver lacuna, e a lacuna é dita', () => {
  assert.match(PACK, /disabled=\{pending \|\| pack\.gaps\.length > 0\}/);
  assert.match(PACK, /Falta para poder gravar/);
  assert.match(PACK, />\s*Validar\s*</);
  assert.match(PACK, />\s*Quero ajustar\s*</);
});

test('o material aparece na forma do formato, frase a frase quando há fala', () => {
  assert.match(PACK, /function Lines\(/);
  assert.match(PACK, /className="cbLines"/);
  assert.match(PACK, /case 'carousel':/);
  assert.match(PACK, /case 'photo_sequence':/);
  assert.match(PACK, /case 'story_sequence':/);
  // Nenhum campo de «roteiro» genérico.
  assert.doesNotMatch(PACK, /label="Roteiro"/);
});

test('falta matéria-prima leva a contar o que aconteceu, não a tentar outra vez', () => {
  assert.match(WEEK, /preciso do que aconteceu de verdade/);
  assert.doesNotMatch(WEEK, /Tentar novamente|Tentar outra vez/);
});

/* ── Mapa ─────────────────────────────────────────────────────────────────── */

test('o Mapa mostra as quatro fases e diz que pausar não apaga', () => {
  assert.match(MAP, /TOPIC_STATES\.map/);
  assert.match(MAP, /Mudar fase/);
  assert.match(MAP, /foco comercial/i);
  assert.match(MAP, /É o mercado, não um pilar/);
});

/* ── Laboratório ──────────────────────────────────────────────────────────── */

test('o Laboratório não transforma ausência de teste em julgamento', () => {
  assert.match(LAB, /Onze Reels seguidos dizem que Reel foi usado/);
  assert.match(LAB, /Um de cada vez\. Sem pergunta boa, nenhum\./);
  // A dependência externa do Radar é dita em voz alta.
  assert.match(LAB, /radarBlocked/);
});

/* ── Comunidade ───────────────────────────────────────────────────────────── */

test('a comunidade é lida como conjunto e admite a amostra pequena', () => {
  assert.match(COMMUNITY, /leitura do conjunto/);
  assert.match(COMMUNITY, /não para dizer o\s+que uma pessoa quis dizer/);
  assert.match(COMMUNITY, /ainda sem leitura/);
});

/* ── Copy ─────────────────────────────────────────────────────────────────── */

test('a interface não mostra o vocabulário interno do sistema', () => {
  const INTERNOS = /\b(score|weighting|cohort|coorte|semantic classifier|confidence model|vector|pipeline|engine|motor de prioridades)\b/i;
  for (const src of TODAS) {
    // Só o texto visível: o que está em atributos e nomes de variáveis não é
    // tela. Aqui basta procurar nos literais entre tags e em strings de texto.
    const visivel = src
      .replace(/^import[\s\S]*?;$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/className="[^"]*"/g, '');
    const achado = visivel.match(INTERNOS);
    assert.equal(achado, null, `«${achado?.[0]}» não é linguagem dela`);
  }
});

/* ── Telemóvel ────────────────────────────────────────────────────────────── */

test('o telemóvel tem tratamento próprio, não é o desktop encolhido', () => {
  const bloco = CSS.slice(CSS.indexOf('.cbWeek {'));
  assert.match(bloco, /@media \(max-width: 600px\)/);
  assert.match(bloco, /min-height: 44px/, 'alvo de toque mínimo');
  assert.match(bloco, /font-size: 16px/, 'abaixo de 16px o iOS dá zoom ao focar');
});

test('nada na área nova cresce para além da coluna', () => {
  for (const classe of ['.cbAngle', '.cbWhy', '.cbField', '.cbWeekSummary', '.cbCommunityReading']) {
    const i = CSS.indexOf(`${classe} {`);
    assert.ok(i > 0, `falta ${classe}`);
    assert.match(CSS.slice(i, i + 260), /max-width: \d+ch/, `${classe} sem limite de linha`);
  }
});
