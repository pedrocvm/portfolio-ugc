import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { HIGH_RISK, needsConfirmetion } from './domain';

/** As ferramentas da Carol AI, lidas como texto.
 *
 *  `tools.ts` importa o cliente do Supabase e meia dúzia de módulos
 *  `server-only`: carregá-lo neste runner não é possível. O que se verifica
 *  aqui é a forma — que classificação cada ferramenta declara, e que o gate
 *  está mesmo ligado no lugar onde as ferramentas correm.
 *
 *  É mais fraco do que exercitar o orquestrador, e diz-se. Mas o que estes
 *  testes protegem é a regra 3 do CarolOS — nada sai para fora sozinho — e
 *  essa merece uma verificação mesmo que só consiga ser estrutural. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const TOOLS = readFileSync(path.join(ROOT, 'modules/assistant/tools.ts'), 'utf8');
const ORCH = readFileSync(path.join(ROOT, 'modules/assistant/orchestrator.ts'), 'utf8');

/** Cada `define('nome', …, 'risk')` da lista registada. */
function ferramentas(): { nome: string; risco: string }[] {
  const out: { nome: string; risco: string }[] = [];
  for (const m of TOOLS.matchAll(/const (\w+) = define\(\s*'([a-z_]+)',/g)) {
    const inicio = m.index ?? 0;
    const fim = TOOLS.indexOf('\n);', inicio);
    const corpo = TOOLS.slice(inicio, fim);
    const risco = /\n\s*'(write|high)',\s*$/.test(corpo) ? RegExp.$1 : 'read';
    out.push({ nome: m[2], risco });
  }
  return out;
}

const registadas = () => {
  const bloco = TOOLS.slice(TOOLS.indexOf('export const TOOLS: Tool[] = ['));
  return bloco.slice(0, bloco.indexOf('];'));
};

test('há ferramentas, e todas declaram um risco válido', () => {
  const todas = ferramentas();
  assert.ok(todas.length >= 25, `só encontrei ${todas.length} ferramentas`);
  for (const f of todas) {
    assert.ok(['read', 'write', 'high'].includes(f.risco), `«${f.nome}» tem risco «${f.risco}»`);
  }
});

/** O coração da coisa. Se uma ferramenta de alto risco alguma vez for
 *  registada, isto falha antes de chegar a produção. */
test('nenhuma ferramenta de alto risco está registada', () => {
  const lista = registadas();
  const nomes = ferramentas();
  const altas = nomes.filter((f) => f.risco === 'high');
  assert.deepEqual(altas, [], `registada com risco alto: ${altas.map((f) => f.nome).join(', ')}`);

  for (const proibida of HIGH_RISK) {
    assert.ok(
      !new RegExp(`'${proibida}'`).test(TOOLS),
      `«${proibida}» está na lista de ações sensíveis e apareceu nas ferramentas`,
    );
  }
  assert.ok(lista.length > 0, 'a lista registada ficou vazia');
});

/** Não existe `gmail.send` em lado nenhum, e o assistente não pode ser a
 *  primeira excepção. */
test('nenhuma ferramenta envia seja o que for', () => {
  // `sendReply` e `sendPreparedReply` são o caminho novo do envio de dentro do
  // CarolOS. Continuam exigindo um clique dela, e por isso nenhuma ferramenta
  // do assistente lhes pode chegar — nem por importação direta.
  const suspeitas = [
    /\bsendCandidate\b/, /\bsendApprovedOutreach\b/, /\bsendOutreach\b/, /messages\/send/,
    /\bsendReply\b/, /\bsendPreparedReply\b/, /email\/send-service/,
  ];
  for (const re of suspeitas) {
    assert.doesNotMatch(TOOLS, re, `as ferramentas alcançam ${re}`);
  }
});

test('preparar um envio diz, no que devolve, que não enviou', () => {
  const i = TOOLS.indexOf("'prepare_outreach_send'");
  assert.ok(i > 0, 'a ferramenta de preparar envio desapareceu');
  const corpo = TOOLS.slice(i, TOOLS.indexOf('\n);', i));
  assert.match(corpo, /Nada foi enviado/);
});

/** A camada da manhã tem de estar ao alcance do assistente: é o que separa
 *  «podes ir a Conteúdo» de «trocado, está aqui». */
test('a Carol AI alcança a manhã, o conteúdo e as referências', () => {
  const lista = registadas();
  const todas = ferramentas();
  for (const nome of [
    'get_morning_brief',
    'get_email_triage',
    'prepare_reply',
    'get_daily_content_plan',
    'get_content_idea',
    'regenerate_content_idea',
    'save_content_idea',
    'get_brand_references',
    'search_creative_references',
    'adapt_reference_to_brand',
    'get_creator_trends',
    'get_creator_profile',
    'get_business_milestones',
    'get_content_multiplier',
    'get_content_strategy',
    // O Content OS: a mentoria aplicada pela Carol AI.
    'get_mentor_playbook',
    'get_content_balance',
    'classify_content_intent',
    'get_three_hooks',
    'deconstruct_reference',
    'evaluate_reels_test',
    'get_reels_test_lab',
    'record_content_performance',
    'get_content_learnings',
    'get_broll_bank',
    'save_broll_take',
    'get_social_proof',
    'save_social_proof',
    'check_duplicate_content',
    'create_content_variant',
    'create_directed_content',
    'discover_braga_places',
  ]) {
    const f = todas.find((x) => x.nome === nome);
    assert.ok(f, `«${nome}» não existe`);
    assert.notEqual(f.risco, 'high', `«${nome}» está classificada como alto risco`);
  }
  assert.match(lista, /getMorningBrief/);
  assert.match(lista, /getDailyContentPlan/);
  assert.match(lista, /regenerateContentIdea/);
  assert.match(lista, /getContentStrategy/);
});

/** A auditoria diz que pôr a Carol a ensinar creators é o erro estratégico
 *  maior. O assistente é onde isso escaparia primeiro — basta ela pedir «uma
 *  ideia sobre UGC» e ele devolver dicas. */
test('o assistente sabe que autoridade não é dar aulas', () => {
  const PROMPT = readFileSync(path.join(ROOT, 'modules/assistant/prompt.ts'), 'utf8');
  assert.match(PROMPT, /AUTORIDADE SIM, PROFESSORA NÃO/);
  assert.match(PROMPT, /Nunca\s+proponhas dicas para creators/);
  // E sabe onde ler a estratégia em vez de a inventar.
  assert.match(PROMPT, /get_content_strategy/);
});

/** Trocar uma ideia, refazer um rascunho e procurar referências mudam o
 *  estado. Marcá-las como leitura deixava o modelo dispará-las em qualquer
 *  resposta — e uma delas gasta uma pesquisa na web por chamada. */
test('preparar, trocar e procurar contam como escrita', () => {
  const todas = ferramentas();
  for (const nome of ['prepare_reply', 'regenerate_content_idea', 'save_content_idea', 'adapt_reference_to_brand']) {
    assert.equal(todas.find((f) => f.nome === nome)?.risco, 'write', `«${nome}» não está como escrita`);
  }
  for (const nome of ['get_morning_brief', 'get_email_triage', 'get_creator_trends', 'get_creator_profile']) {
    assert.equal(todas.find((f) => f.nome === nome)?.risco, 'read', `«${nome}» não devia escrever`);
  }
});

/** Preparar não é enviar, e o que a ferramenta devolve tem de o dizer — senão
 *  o modelo relata «respondi à Cecotec» quando só escreveu um rascunho. */
test('preparar uma resposta diz, no que devolve, que não enviou', () => {
  const i = TOOLS.indexOf("'prepare_reply'");
  assert.ok(i > 0, 'a ferramenta de preparar resposta desapareceu');
  const corpo = TOOLS.slice(i, TOOLS.indexOf('\n);', i));
  assert.match(corpo, /exigindo o sim dela/);
});

/** O gate tem de estar no lugar onde as ferramentas correm — não só na lista
 *  onde são declaradas. Uma lista certa e um executor sem verificação é uma
 *  garantia que dura até ao próximo `define`. */
test('o orquestrador recusa alto risco antes de correr a ferramenta', () => {
  const i = ORCH.indexOf('const tool = byName.get(call.name);');
  assert.ok(i > 0, 'o executor de ferramentas mudou de forma');
  const corre = ORCH.indexOf('await tool.run(', i);
  const gate = ORCH.indexOf("tool.risk === 'high'", i);
  assert.ok(gate > 0, 'não há verificação de risco no executor');
  assert.ok(gate < corre, 'a verificação de risco acontece depois de a ferramenta correr');
});

test('a lista de ações sensíveis cobre o que sai para fora e o que não se desfaz', () => {
  for (const nome of ['send_email', 'send_proposal', 'accept_opportunity', 'delete_data', 'publish_case']) {
    assert.ok(needsConfirmetion(nome), `«${nome}» deixou de contar como sensível`);
  }
  assert.equal(needsConfirmetion('search_brands'), false);
  assert.equal(needsConfirmetion('start_prospecting'), false);
});

/** As que operam o CarolOS existem, e são todas reversíveis. É o ponto de
 *  «a Carol AI deixa de ser só consultiva». */
test('as ferramentas que operam o sistema estão registadas e são reversíveis', () => {
  const lista = registadas();
  const todas = ferramentas();
  for (const nome of [
    'start_prospecting',
    'set_prospecting_focus',
    'resolve_today_action',
    'capture_something',
    'find_anything',
  ]) {
    assert.match(TOOLS, new RegExp(`'${nome}'`), `«${nome}» não existe`);
    const f = todas.find((x) => x.nome === nome);
    assert.ok(f, `«${nome}» não foi lida`);
    assert.notEqual(f.risco, 'high', `«${nome}» está classificada como alto risco`);
  }
  assert.match(lista, /startProspecting/);
  assert.match(lista, /setProspectingFocus/);
  assert.match(lista, /resolveTodayAction/);
});

/** Começar uma busca é escrever, não ler. Se alguém a marcar como leitura, o
 *  modelo passa a poder disparar buscas em qualquer resposta. */
test('começar uma busca e mudar o foco contam como escrita', () => {
  const todas = ferramentas();
  for (const nome of ['start_prospecting', 'set_prospecting_focus', 'resolve_today_action', 'capture_something']) {
    assert.equal(todas.find((f) => f.nome === nome)?.risco, 'write', `«${nome}» não está como escrita`);
  }
  assert.equal(todas.find((f) => f.nome === 'get_prospecting_focus')?.risco, 'read');
  assert.equal(todas.find((f) => f.nome === 'find_anything')?.risco, 'read');
});


/** A prova social só sai com permissão dela. A ferramenta que a guarda não
 *  pode ser o sítio onde a permissão se dá. */
test('a Carol AI guarda prova social mas nunca dá a permissão', () => {
  const i = TOOLS.indexOf("'save_social_proof'");
  assert.ok(i > 0, 'a ferramenta de prova social desapareceu');
  const corpo = TOOLS.slice(i, TOOLS.indexOf('\n);', i));
  assert.doesNotMatch(corpo, /setSocialProofPermission|permission:\s*'granted'|usable_for/);
  assert.match(corpo, /Nunca marques um feedback como usável/);
});

/** O Instagram não tem API para mover um teste para o feed. Nenhuma
 *  ferramenta pode fingir que o faz. */
test('nenhuma ferramenta publica nem move um teste para o feed', () => {
  assert.doesNotMatch(TOOLS, /\bmarkPromotedToFeed\b|\bpromoteToFeed\b/);
  const i = TOOLS.indexOf("'get_reels_test_lab'");
  const corpo = TOOLS.slice(i, TOOLS.indexOf('\n);', i));
  assert.match(corpo, /não publica/);
});
