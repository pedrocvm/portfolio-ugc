import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** O contrato das ferramentas da estratégia de conteúdo, verificado na fonte.
 *
 *  Como em `content-brain-tools.test.ts`: ler o texto em vez de importar, para
 *  o teste não precisar de credencial de Supabase. O que se prova aqui é o
 *  contrato — que existem, com que risco, e o que a descrição promete. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const SRC = readFileSync(path.join(ROOT, 'modules/assistant/content-strategy-tools.ts'), 'utf8');
const TOOLS = readFileSync(path.join(ROOT, 'modules/assistant/tools.ts'), 'utf8');
const PROMPT = readFileSync(path.join(ROOT, 'modules/assistant/prompt.ts'), 'utf8');

function ferramentas(): { nome: string; risco: string; descricao: string }[] {
  const blocos = SRC.split(/(?=const \w+ = define\()/).slice(1);
  const out: { nome: string; risco: string; descricao: string }[] = [];
  for (const bloco of blocos) {
    const cabeca = bloco.match(/define\(\s*\n\s*'([\w_]+)',\s*\n\s*'([^']*(?:\\'[^']*)*)'/);
    if (!cabeca) continue;
    const fecho = bloco.match(/\n\s{2}'(read|write|high)',\n\);/);
    out.push({ nome: cabeca[1], descricao: cabeca[2], risco: fecho ? fecho[1] : 'read' });
  }
  return out;
}

const TODAS = ferramentas();

test('as ferramentas da estratégia estão registadas no assistente', () => {
  assert.ok(TODAS.length >= 8, `só encontrei ${TODAS.length} ferramentas`);
  assert.match(TOOLS, /\.\.\.CONTENT_STRATEGY_TOOLS/, 'as ferramentas não entram no registro');
});

test('a Carol AI consome o mesmo motor da tela, e não tem um seu', () => {
  // Cada leitura importa o serviço real. Uma ferramenta que calculasse
  // prioridade aqui dava-lhe duas respostas diferentes à mesma pergunta.
  for (const servico of ['week-service', 'editorial-service', 'lab-service', 'community-service']) {
    assert.match(SRC, new RegExp(`import\\('@/modules/content-brain/${servico}'\\)`), servico);
  }
  // E não reimplementa nada: o motor puro não é importado aqui.
  assert.doesNotMatch(SRC, /buildWeek/);
  assert.doesNotMatch(SRC, /formatMaturity/);
});

test('aprovar e validar não são ferramentas: são as decisões dela', () => {
  for (const proibida of [
    'approve_proposal', 'validate_pack', 'validate_material', 'approve_week',
    'publish_content', 'post_content',
  ]) {
    assert.doesNotMatch(SRC, new RegExp(`'${proibida}'`), `«${proibida}» não pode existir`);
  }
  assert.match(PROMPT, /Aprovar uma proposta e validar um roteiro NÃO são tuas/);
});

test('nenhuma é de risco alto, e o que escreve está marcado', () => {
  assert.deepEqual(TODAS.filter((f) => f.risco === 'high'), []);
  for (const nome of ['set_topic_phase', 'save_content_reference']) {
    const f = TODAS.find((x) => x.nome === nome);
    assert.ok(f, `falta ${nome}`);
    assert.equal(f.risco, 'write', `${nome} muda estado e tem de estar marcada`);
  }
  for (const nome of ['get_content_week', 'explain_content_proposal', 'get_editorial_map',
                      'get_format_lab', 'get_community_quality', 'get_recent_learnings']) {
    assert.equal(TODAS.find((x) => x.nome === nome)?.risco, 'read', nome);
  }
});

test('as descrições carregam os guardrails que o modelo precisa de ouvir', () => {
  const byName = new Map(TODAS.map((f) => [f.nome, f.descricao]));
  assert.match(byName.get('get_editorial_map') ?? '', /foco comercial, não pilar/);
  assert.match(byName.get('get_format_lab') ?? '', /não testado/i);
  assert.match(byName.get('get_community_quality') ?? '', /conjunto/);
  assert.match(byName.get('get_recent_learnings') ?? '', /NÃO são conclusão/);
  assert.match(byName.get('explain_content_proposal') ?? '', /Nunca inventes uma razão/);
});
