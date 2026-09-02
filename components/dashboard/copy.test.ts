import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** A voz da interface, verificada como texto.
 *
 *  A Carol é brasileira. O produto inteiro fala português do Brasil — não há
 *  meia dúzia de telas numa variante e o resto noutra, porque isso lê-se como
 *  descuido e não como escolha.
 *
 *  A pessoa continua sendo a terceira, sem sujeito: «Há alterações por salvar».
 *  Evita decidir entre tratar por tu e tratar por você, decisão que nenhuma das
 *  duas hipóteses ganha e que se nota sempre que as duas aparecem juntas.
 *
 *  Isto lê arquivos como texto porque o alvo é o texto. Não valida gramática:
 *  trava as formas concretas de português europeu que já apareceram. */

const ROOT = path.join(import.meta.dirname, '..', '..');

/** Só o que a Carol lê. Os prompts falam com um modelo e são outra língua de
 *  trabalho; os testes e os comentários não vão parar a lado nenhum. */
const PASTAS = ['components/dashboard', 'components/assistant'];

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivos(rel));
    else if (/\.tsx$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Comentário não é interface.
 *
 *  Os blocos apagam-se em vez de as linhas serem filtradas pelo prefixo: um
 *  comentário JSX de três linhas só tem marcador na primeira, e as outras duas
 *  passavam por texto de tela. Os blocos viram linhas vazias para os números
 *  continuarem a bater certo com o arquivo. */
const semComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (_, antes: string) => antes);

const linhasVisiveis = (src: string) =>
  semComentarios(src)
    .split('\n')
    .map((l, i) => ({ n: i + 1, texto: l }));

const TODOS = PASTAS.flatMap(arquivos);

function procurar(re: RegExp): string[] {
  const achados: string[] = [];
  for (const f of TODOS) {
    for (const { n, texto } of linhasVisiveis(readFileSync(path.join(ROOT, f), 'utf8'))) {
      const m = texto.match(re);
      if (m) achados.push(`${f}:${n} «${m[0]}»`);
    }
  }
  return achados;
}

test('há telas para verificar', () => {
  assert.ok(TODOS.length >= 20, `só encontrei ${TODOS.length} arquivos de interface`);
});

/** As palavras que só existem deste lado do Atlântico.
 *
 *  Cuidado com `\b` em JavaScript: a fronteira de palavra só conhece
 *  `[A-Za-z0-9_]`, por isso «ã» e «ó» já contam como fora da palavra e
 *  `\becrã\b` nunca casa. É por isso que o corte é feito com `[^\p{L}]`. */
test('nenhuma tela fala português europeu', () => {
  const achados = procurar(
    /(^|[^\p{L}])(ecrãs?|ficheiros?|telemóve(l|is)|utilizador(es)?|portefólios?|equipa|ementa|rapariga|morada|apelido|connosco|percebeste|sítios?)($|[^\p{L}])/iu,
  );
  assert.deepEqual(achados, [], `português europeu: ${achados.join(', ')}`);
});

test('a grafia é a do Brasil', () => {
  const achados = procurar(
    /(^|[^\p{L}])(ac(ç|c)ão|ac(ç|c)ões|direc(ç|c)ão|selec(ç|c)ão|colec(ç|c)ão|objectivos?|actual(mente)?|actualiza\w*|contact(o|os|ar)|regist(o|os)|fact(o|os)|direct(o|a|os|as)|exact\w*|correct\w*|óptim(o|a|os|as))($|[^\p{L}])/iu,
  );
  assert.deepEqual(achados, [], `grafia europeia: ${achados.join(', ')}`);
});

/** «no tela» não é português nenhum.
 *
 *  «Ecrã» é masculino e «tela» é feminina. A troca de palavra foi feita por
 *  substituição e deixou o artigo para trás em quinze sítios — «texto no
 *  tela», que se lê pior do que o original que se veio corrigir. */
test('o artigo concorda com a palavra que ficou', () => {
  const achados = procurar(/(^|[^\p{L}])(no|do|ao|pelo|num|dum)\s+tela($|[^\p{L}])/iu);
  assert.deepEqual(achados, [], `artigo por concordar: ${achados.join(', ')}`);
});

/** «Precisa de saber» é a preposição a mais que só existe deste lado. */
test('não há preposição antes do infinitivo', () => {
  const achados = procurar(
    /(^|[^\p{L}])(precisa|precisam|precisas|preciso)\s+de\s+(ser|saber|preencher|dizer|ter|estar|ir|fazer|ler|escrever|responder|voltar|mexer|abrir|decidir|escolher|salvar|gravar|publicar|enviar)($|[^\p{L}])/iu,
  );
  assert.deepEqual(achados, [], `preposição a mais: ${achados.join(', ')}`);
});

/** «Está carregando» é o que mais denuncia a variante, e não há substituição
 *  de palavra que o apanhe: é a construção inteira que muda. */
test('o gerúndio é gerúndio, não «a» mais infinitivo', () => {
  const achados = procurar(
    /(^|[^\p{L}])(está|estás|estou|estamos|estão|estava|estavam|continua|continuam|fica|ficam|anda|andam)\s+a\s+[a-zà-ú]+(ar|er|ir)($|[^\p{L}])/iu,
  );
  assert.deepEqual(achados, [], `«a» mais infinitivo: ${achados.join(', ')}`);
});

test('a palavra é salvar', () => {
  const achados = procurar(/(^|[^\p{L}])guard(ar|ado|ados|ada|adas|a|o)($|[^\p{L}])/iu);
  assert.deepEqual(achados, [], `«salvar» em vez de «salvar»: ${achados.join(', ')}`);
});

/** O outro lado do mesmo problema: tratar por tu numa tela e por si na
 *  seguinte. Sem sujeito não é preciso escolher — e «de você» não existe no
 *  Brasil de todo. */
test('a interface não trata por tu nem por si', () => {
  // «de ti» entra na lista: estava num `aria-label`, que é texto de tela para
  // quem usa leitor de tela e passou despercebido a olho.
  const achados = procurar(
    /\b(tens|queres|podes|precisas|deixes|leres|enviares|responderes|escreves)\b|\bde ti\b|\bteu\b|\btua\b|\bde si\b/i,
  );
  assert.deepEqual(achados, [], `tratamento por tu ou por si: ${achados.join(', ')}`);
});

/** Um identificador da base numa frase é o sistema a falar com você próprio à
 *  frente de quem o usa — «Estava em replied» chegou a estar no Hoje.
 *
 *  Não dá para verificar isto na fonte olhando para o que sai: o valor vem de
 *  uma variável. O que se verifica é a forma — quem desenha uma etapa tem de
 *  ter ido buscar a tabela de nomes. Um arquivo que mostra `.stage` sem
 *  importar `STAGE_LABEL` está mostrando o id. */
/** O cartão da captura listava sete nomes de campo do schema — em inglês, com
 *  underscores — a dizer o que o extractor não tinha conseguido. Nomes de
 *  campo não são texto de tela em circunstância nenhuma, e `unknowns` é a
 *  lista deles. */
test('nenhuma tela desenha a lista de campos em falta', () => {
  const achados: string[] = [];
  for (const f of TODOS) {
    const src = semComentarios(readFileSync(path.join(ROOT, f), 'utf8'));
    for (const m of src.matchAll(/\{[^{}]*\.unknowns[^{}]*\}/g)) {
      achados.push(`${f} «${m[0].replace(/\s+/g, ' ').trim().slice(0, 60)}»`);
    }
  }
  assert.deepEqual(achados, [], `campos do schema na tela: ${achados.join(', ')}`);
});

test('nenhuma etapa é desenhada em bruto', () => {
  // Só o que é mesmo texto de tela: `{x.stage}` a seguir a um `>`, que em JSX
  // bem indentado cai na linha seguinte — por isso a procura é no arquivo
  // inteiro e não linha a linha. Um `data-stage={b.stage}` é um atributo para o
  // CSS pintar, e uma etapa dentro de uma expressão pode ser lógica: nenhum dos
  // dois chega aos olhos dela.
  const achados: string[] = [];
  for (const f of TODOS) {
    const src = semComentarios(readFileSync(path.join(ROOT, f), 'utf8'));
    for (const m of src.matchAll(/>\s*\{\s*[\w.?]*\.stage\s*\}/g)) {
      achados.push(`${f} «${m[0].replace(/\s+/g, ' ').trim()}»`);
    }
  }
  assert.deepEqual(achados, [], `etapa em bruto na tela: ${achados.join(', ')}`);
});
