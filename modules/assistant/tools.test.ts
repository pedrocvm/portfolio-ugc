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
 *  está mesmo ligado no sítio onde as ferramentas correm.
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
  const suspeitas = [/\bsendCandidate\b/, /\bsendApprovedOutreach\b/, /\bsendOutreach\b/, /messages\/send/];
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

/** O gate tem de estar no sítio onde as ferramentas correm — não só na lista
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
