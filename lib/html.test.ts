import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeEntities } from './html';

/** O `snippet` da API do Gmail vem escapado em HTML mesmo quando o email é
 *  texto simples. Passava direto para a base e daí para a tela, e a Inbox
 *  mostrava «I&#39;m sharing my portfolio» a uma pessoa que não tem de saber
 *  o que isso é. */

test('as entidades comuns viram texto', () => {
  assert.equal(decodeEntities('I&#39;m sharing'), "I'm sharing");
  assert.equal(decodeEntities('Carolina &lt;carol@exemplo.pt&gt;'), 'Carolina <carol@exemplo.pt>');
  assert.equal(decodeEntities('a &quot;marca&quot;'), 'a "marca"');
  assert.equal(decodeEntities('Pedro &amp; Carol'), 'Pedro & Carol');
  assert.equal(decodeEntities('sem&nbsp;espaço'), 'sem espaço');
});

/** A ordem importa. Com o «&amp;» primeiro, «&amp;lt;» descodificava para
 *  «&lt;» e a substituição seguinte transformava-o em «<» — texto que o
 *  remetente escreveu à mão a virar marcação. */
test('um «&amp;lt;» escrito à mão continua a ler-se «&lt;»', () => {
  assert.equal(decodeEntities('escreve &amp;lt; assim'), 'escreve &lt; assim');
});

test('entidades numéricas também', () => {
  assert.equal(decodeEntities('cust&#243;dia'), 'custódia');
  assert.equal(decodeEntities('&#8364;250'), '€250');
});

test('texto sem entidades nenhumas fica exactamente igual', () => {
  const limpo = 'Olá Carolina, queríamos falar sobre uma campanha — 3 vídeos.';
  assert.equal(decodeEntities(limpo), limpo);
});
