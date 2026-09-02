import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** A voz da interface, verificada como texto.
 *
 *  A mesma tela dizia «você tem alterações não salvas» e, dois cliques abaixo,
 *  «só deixes assim se for mesmo o que queres». Duas pessoas diferentes a falar
 *  com ela — e nenhuma das duas era o sistema.
 *
 *  A escolha foi terceira pessoa, sem sujeito: «Há alterações por guardar».
 *  Evita ter de decidir entre tratar por tu e tratar por você, que é uma
 *  decisão que nenhuma das duas hipóteses ganha, e que se nota sempre que as
 *  duas aparecem na mesma tela.
 *
 *  Isto lê ficheiros como texto porque o alvo é o texto. Não valida gramática:
 *  trava as formas concretas que estavam misturadas. */

const ROOT = path.join(import.meta.dirname, '..', '..');

/** Só o que a Carol lê. Os prompts falam com um modelo e são outra língua de
 *  trabalho; os testes e os comentários não vão parar a lado nenhum. */
const PASTAS = ['components/dashboard', 'components/assistant'];

function ficheiros(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...ficheiros(rel));
    else if (/\.tsx$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Comentário não é interface.
 *
 *  Os blocos apagam-se em vez de as linhas serem filtradas pelo prefixo: um
 *  comentário JSX de três linhas só tem marcador na primeira, e as outras duas
 *  passavam por texto de tela. Os blocos viram linhas vazias para os números
 *  continuarem a bater certo com o ficheiro. */
const semComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (_, antes: string) => antes);

const linhasVisiveis = (src: string) =>
  semComentarios(src)
    .split('\n')
    .map((l, i) => ({ n: i + 1, texto: l }));

const TODOS = PASTAS.flatMap(ficheiros);

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
  assert.ok(TODOS.length >= 20, `só encontrei ${TODOS.length} ficheiros de interface`);
});

/** «Você» e «salvar» são do Brasil. A Carol é brasileira, mas o produto todo
 *  está escrito em português europeu — e meia dúzia de frases numa variante e
 *  o resto noutra lê-se como descuido, não como escolha. */
test('a interface não trata por «você»', () => {
  // Sem `\b` depois do «ê»: em JavaScript a fronteira de palavra só conhece
  // `[A-Za-z0-9_]`, por isso «ê» já é fora da palavra e `\bvocê\b` nunca casa.
  // O teste passava por não encontrar nada — que é o pior modo de passar.
  const achados = procurar(/(^|[^\p{L}])você($|[^\p{L}])/iu);
  assert.deepEqual(achados, [], `tratamento brasileiro: ${achados.join(', ')}`);
});

test('guarda-se, não se salva', () => {
  const achados = procurar(/\bsalv(ar|o|a|os|as)\b/i);
  assert.deepEqual(achados, [], `«salvar» em vez de «guardar»: ${achados.join(', ')}`);
});

/** O outro lado do mesmo problema: tratar por tu numa tela e por si na
 *  seguinte. Sem sujeito não é preciso escolher. */
test('a interface não trata por tu', () => {
  // «de ti» entra na lista: estava num `aria-label`, que é texto de tela para
  // quem usa leitor de ecrã e passou despercebido a olho.
  const achados = procurar(
    /\b(tens|queres|podes|precisas|deixes|leres|enviares|responderes|escreves)\b|\bde ti\b|\bteu\b|\btua\b/i,
  );
  assert.deepEqual(achados, [], `tratamento por tu: ${achados.join(', ')}`);
});

/** Um identificador da base numa frase é o sistema a falar consigo próprio à
 *  frente de quem o usa — «Estava em replied» chegou a estar no Hoje.
 *
 *  Não dá para verificar isto na fonte olhando para o que sai: o valor vem de
 *  uma variável. O que se verifica é a forma — quem desenha uma etapa tem de
 *  ter ido buscar a tabela de nomes. Um ficheiro que mostra `.stage` sem
 *  importar `STAGE_LABEL` está a mostrar o id. */
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
  // bem indentado cai na linha seguinte — por isso a procura é no ficheiro
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
