import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** As garantias das ferramentas do Content Brain, verificadas na fonte.
 *
 *  Ler o ficheiro como texto em vez de o importar é deliberado: importar
 *  arrastava o cliente de Supabase e o teste passava a precisar de credencial.
 *  O que interessa provar aqui é o contrato — que ferramentas existem, com que
 *  risco, e o que a descrição promete ao modelo. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const SRC = readFileSync(path.join(ROOT, 'modules/assistant/content-brain-tools.ts'), 'utf8');
const PROMPT = readFileSync(path.join(ROOT, 'modules/assistant/prompt.ts'), 'utf8');
const TOOLS = readFileSync(path.join(ROOT, 'modules/assistant/tools.ts'), 'utf8');

/** Cada `define(...)` com o nome e o risco declarado no fim.
 *
 *  O bloco de cada ferramenta é o texto até ao `define(` seguinte. Sem esse
 *  corte, a procura pelo risco encontrava o `'write',` da ferramenta a seguir
 *  e marcava uma leitura como escrita. */
function ferramentas(): { nome: string; risco: string; descricao: string }[] {
  const blocos = SRC.split(/(?=const \w+ = define\()/).slice(1);
  const out: { nome: string; risco: string; descricao: string }[] = [];
  for (const bloco of blocos) {
    const cabeca = bloco.match(/define\(\s*\n\s*'([\w_]+)',\s*\n\s*'([^']*(?:\\'[^']*)*)'/);
    if (!cabeca) continue;
    // O risco é o último argumento; sem ele, é leitura.
    const fecho = bloco.match(/\n\s{2}'(read|write|high)',\n\);/);
    out.push({ nome: cabeca[1], descricao: cabeca[2], risco: fecho ? fecho[1] : 'read' });
  }
  return out;
}

const TODAS = ferramentas();

test('as ferramentas do Content Brain estão registadas no assistente', () => {
  assert.ok(TODAS.length >= 18, `só encontrei ${TODAS.length} ferramentas`);
  assert.match(TOOLS, /\.\.\.CONTENT_BRAIN_TOOLS/, 'as ferramentas não entram no registro');
});

/** A regra 3 do CarolOS: nada sai para fora sozinho. Não é lembrar de
 *  verificar — é não existir caminho. */
test('nenhuma ferramenta de conteúdo é de risco alto', () => {
  const altas = TODAS.filter((f) => f.risco === 'high');
  assert.deepEqual(altas, [], `ferramentas de risco alto: ${altas.map((f) => f.nome).join(', ')}`);
});

test('não existe ferramenta de publicar, responder comentário ou enviar DM', () => {
  for (const proibida of ['publish_instagram', 'publish_reel', 'reply_comment', 'send_dm', 'post_content']) {
    assert.doesNotMatch(SRC, new RegExp(`'${proibida}'`), `«${proibida}» não pode existir`);
  }
});

test('tudo o que muda estado está marcado como escrita', () => {
  const devemEscrever = [
    'capture_story', 'confirm_story_facts', 'save_story_meaning', 'map_story_to_pillar',
    'select_story_frame', 'structure_story', 'set_content_status', 'mark_story_private',
    'confirm_trial_reel', 'plan_content_week', 'save_story_candidate', 'add_story_to_series',
  ];
  for (const nome of devemEscrever) {
    const f = TODAS.find((x) => x.nome === nome);
    assert.ok(f, `falta a ferramenta «${nome}»`);
    assert.equal(f.risco, 'write', `«${nome}» tinha de ser escrita`);
  }
});

test('as leituras são leituras', () => {
  for (const nome of ['get_content_focus', 'list_story_bank', 'get_story', 'get_instagram_performance', 'get_content_learnings']) {
    const f = TODAS.find((x) => x.nome === nome);
    assert.ok(f, `falta a ferramenta «${nome}»`);
    assert.equal(f.risco, 'read', `«${nome}» não devia escrever`);
  }
});

/* ── O invariant, dito ao modelo ──────────────────────────────────────────── */

test('o banco de histórias vazio instrui a perguntar, não a inventar', () => {
  const f = TODAS.find((x) => x.nome === 'list_story_bank');
  assert.match(f!.descricao, /Se estiver vazio, NÃO inventes/i);
  // E a instrução vai também no dado devolvido, que é o que o modelo lê ao
  // decidir o passo seguinte.
  assert.match(SRC, /NÃO inventes uma história\. Pergunta à Carol o que aconteceu/);
});

test('capturar não confirma', () => {
  const f = TODAS.find((x) => x.nome === 'capture_story');
  assert.match(f!.descricao, /NÃO marca como confirmado: quem confirma é ela/);
  assert.match(SRC, /Só ela confirma/);
});

test('confirmar exige que ela tenha confirmado', () => {
  const f = TODAS.find((x) => x.nome === 'confirm_story_facts');
  assert.match(f!.descricao, /DEPOIS de a Carol dizer/);
  assert.match(f!.descricao, /Nunca chames isto sem ela ter confirmado/);
});

test('estruturar declara que pode ser recusado', () => {
  const f = TODAS.find((x) => x.nome === 'structure_story');
  assert.match(f!.descricao, /Exige fatos confirmados e ponto escolhido/);
});

test('o Reel Test é fato humano e a ferramenta diz isso', () => {
  const f = TODAS.find((x) => x.nome === 'confirm_trial_reel');
  assert.match(f!.descricao, /A API não diz isso/);
});

test('a série recusa episódios que ainda não aconteceram', () => {
  const f = TODAS.find((x) => x.nome === 'add_story_to_series');
  assert.match(f!.descricao, /Nunca cria episódios que ainda não aconteceram/);
});

test('a escada de evidência aparece na ferramenta de aprendizados', () => {
  const f = TODAS.find((x) => x.nome === 'get_content_learnings');
  assert.match(f!.descricao, /NUNCA apresentes um sinal como se fosse regra/);
});

/* ── O prompt ─────────────────────────────────────────────────────────────── */

test('o prompt proíbe inventar e diz o que fazer com o banco vazio', () => {
  assert.match(PROMPT, /sem matéria-prima real confirmada, não existe\s*\n?conteúdo pessoal estruturado/i);
  assert.match(PROMPT, /Nunca devolvas uma lista de ideias/);
  assert.match(PROMPT, /NÃO INVENTES/);
  // Banco vazio já não leva à pergunta aberta: leva às direções de busca, que
  // é a correção desta camada.
  assert.match(PROMPT, /list_story_lenses/);
  assert.match(PROMPT, /DIREÇÕES DE BUSCA/);
});

test('o prompt manda ler o banco antes de responder «me dá uma ideia»', () => {
  assert.match(PROMPT, /list_story_bank/);
  assert.match(PROMPT, /get_content_focus/);
});

test('o prompt diz que pilar é função e que as cinco antigas eram tema', () => {
  assert.match(PROMPT, /QUATRO PILARES, e são FUNÇÕES, não temas/);
  assert.match(PROMPT, /já não\s*\n?governam nada/);
});

test('o prompt manda respeitar a correção dela', () => {
  assert.match(PROMPT, /isso não aconteceu assim.*corriges e não insistes/is);
  assert.match(PROMPT, /A memória\s*\n?dela ganha à tua leitura/);
});

test('o prompt separa sinal de regra', () => {
  assert.match(PROMPT, /é um SINAL, não uma regra/);
  assert.match(PROMPT, /validated\S* orienta decisão/i);
});

test('o prompt manda marcar privado na hora', () => {
  assert.match(PROMPT, /mark_story_private.*na hora/);
});

/* ── Direções de busca ────────────────────────────────────────────────────── */

test('as três ferramentas de direção existem, e só as que escrevem escrevem', () => {
  const ler = TODAS.find((f) => f.nome === 'list_story_lenses');
  assert.ok(ler, 'falta list_story_lenses');
  assert.equal(ler.risco, 'read');

  for (const nome of ['open_story_lens', 'rate_story_lens']) {
    const f = TODAS.find((x) => x.nome === nome);
    assert.ok(f, `falta ${nome}`);
    assert.equal(f.risco, 'write', `«${nome}» muda estado e tinha de ser escrita`);
  }
});

test('listar direções diz explicitamente que não são ideias', () => {
  const f = TODAS.find((x) => x.nome === 'list_story_lenses');
  assert.match(f!.descricao, /NÃO devolvas ideias/i);
  assert.match(f!.descricao, /que TIPO de situação/i);
  // E a instrução vai no dado, que é o que o modelo lê ao decidir o passo
  // seguinte — não só na descrição.
  assert.match(SRC, /Uma lente NÃO é uma história: nunca digas que alguma coisa aconteceu com ela/);
});

test('abrir uma direção instrui a trocar de porta quando ela não lembra', () => {
  const f = TODAS.find((x) => x.nome === 'open_story_lens');
  assert.match(f!.descricao, /UMA pergunta de cada vez/i);
  assert.match(SRC, /oferece OUTRA direção — nunca inventes a situação/);
  assert.match(SRC, /Nenhuma destas perguntas afirma que alguma coisa aconteceu/);
});

test('o prompt oferece direções em vez da pergunta aberta', () => {
  assert.match(PROMPT, /Uma direção NÃO é uma ideia/);
  assert.match(PROMPT, /onde ela vai procurar dentro da própria memória/i);
  // Os quatro caminhos do eval do briefing.
  assert.match(PROMPT, /alguma coisa que deu\s*\n?\s*errado/i);
  assert.match(PROMPT, /expectativa que\s*\n?\s*foi diferente da realidade/i);
});

test('o prompt sabe o que fazer com «não lembrei de nada»', () => {
  assert.match(PROMPT, /não lembrei de nada.*resposta legítima/is);
  assert.match(PROMPT, /Nunca inventas a situação para desbloquear/);
});

test('o prompt não obriga quem já sabe a atravessar o assistente', () => {
  assert.match(PROMPT, /já sei o que quero contar.*salta as direções/is);
  assert.match(PROMPT, /Não a obrigues a atravessar um assistente/);
});

test('o prompt mostra a forma certa e a errada de perguntar', () => {
  // A pergunta que pressupõe o fato, nomeada como erro.
  assert.match(PROMPT, /Quando uma marca recusou\s+a tua proposta/);
  assert.match(PROMPT, /dá a recusa por adquirida/);
  assert.match(PROMPT, /respondeu de um jeito diferente do que esperavas/i);
});
