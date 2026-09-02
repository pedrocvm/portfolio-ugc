/** Converte o texto do produto de português europeu para português do Brasil.
 *
 *  Toca só em texto: literais de string, template literals e texto JSX. Nunca
 *  em identificadores — `actual`, `guardadas` e `contacto` aparecem como nomes
 *  de variáveis, e uma substituição cega partia o build.
 *
 *  Corre uma vez e fica no histórico. Não é uma ferramenta para manter: se
 *  amanhã alguém escrever «ecrã», é o teste de voz que apanha, não isto.
 *
 *      node scripts/ptbr.mjs            # mostra o que mudaria
 *      node scripts/ptbr.mjs --write    # escreve
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
/** Os comentários não são interface, mas são texto do projeto na mesma. */
const COMENTARIOS = process.argv.includes('--comentarios');

/** Palavra a palavra. A ordem importa: as mais longas primeiro. */
const LEXICO = [
  // grafia: a regra geral é o «c» mudo antes de «ç» e de «t»
  [/cç(ão|ões)/gi, (_m, f) => `ç${f}`],
  [/\bac(ç|c)ão\b/gi, 'ação'],
  [/\bac(ç|c)ões\b/gi, 'ações'],
  [/\bdirec(ç|c)ão\b/gi, 'direção'],
  [/\bselec(ç|c)ão\b/gi, 'seleção'],
  [/\bcolec(ç|c)ão\b/gi, 'coleção'],
  [/\bobjectivos?\b/gi, (m) => (m.endsWith('s') ? 'objetivos' : 'objetivo')],
  [/\bactualiza/gi, 'atualiza'],
  [/\bactualmente\b/gi, 'atualmente'],
  [/\bactivid/gi, 'ativid'],
  [/\bdirect(o|a|os|as)\b/gi, (m) => 'diret' + m.slice(-1)],
  [/\bexact(o|a|os|as|amente)\b/gi, (m) => 'exat' + m.slice(5)],
  [/\bcorrect(o|a|os|as|amente)\b/gi, (m) => 'corret' + m.slice(7)],
  [/(?<![\p{L}])óptim(o|a|os|as)\b/giu, (m) => 'ótim' + m.slice(-1)],
  [/\badop(t)?(ar|ta|tar)\b/gi, 'adotar'],
  [/\bfact(o|os)\b/gi, (m) => (m.endsWith('s') ? 'fatos' : 'fato')],
  [/\bcontact(o|os|ar|ei|ou)\b/gi, (m) => 'contat' + m.slice(7)],
  [/\bregist(o|os)\b/gi, (m) => (m.endsWith('s') ? 'registros' : 'registro')],
  // léxico
  [/\becrãs?(?![\p{L}])/giu, (m) => (m.endsWith('s') ? 'telas' : 'tela')],
  [/\bficheiros?\b/gi, (m) => (m.endsWith('s') ? 'arquivos' : 'arquivo')],
  [/\btelemóve(l|is)\b/gi, (m) => (m.endsWith('is') ? 'celulares' : 'celular')],
  [/\butilizador(es)?\b/gi, (m) => (m.endsWith('es') ? 'usuários' : 'usuário')],
  [/\bportef(ó|o)lio\b/gi, 'portfólio'],
  [/\brapariga\b/gi, 'menina'],
  [/\bcasa de banho\b/gi, 'banheiro'],
  [/\bsítios\b/gi, 'sites'],
  [/\bsítio\b/gi, 'lugar'],
  [/\bequipa\b/gi, 'equipe'],
  [/\bementa\b/gi, 'cardápio'],
  [/\bapelido\b/gi, 'sobrenome'],
  [/\bmorada\b/gi, 'endereço'],
  [/\bpercebe(s|r)?\b/gi, (m) => (m === 'perceber' ? 'entender' : m.endsWith('s') ? 'entendes' : 'entende')],
  [/\bconnosco\b/gi, 'conosco'],
  // guardar -> salvar (o projeto tinha trocado ao contrário)
  [/\bguardar\b/gi, 'salvar'],
  [/\bguardado(s)?\b/gi, (m) => (m.endsWith('s') ? 'salvos' : 'salvo')],
  [/\bguardada(s)?\b/gi, (m) => (m.endsWith('s') ? 'salvas' : 'salva')],
  [/\bguarda\b/gi, 'salva'],
  [/\bguardo\b/gi, 'salvo'],
  [/\bGuardar\b/g, 'Salvar'],
  // tratamento
  [/\bprecisa de si\b/gi, 'precisa de você'],
  [/\bprecisam de si\b/gi, 'precisam de você'],
  [/\bde si\b/gi, 'de você'],
  [/\bconsigo\b(?!\s+(ver|fazer|ler|usar|enviar|escrever|responder|abrir|saber|pesquisar))/gi, 'com você'],
];

/** O gerúndio: «está a carregar» → «está carregando». É o que mais denuncia. */
const GERUNDIO = [
  [/\b(está|estás|estou|estamos|estão|estava|estavam|esteve)\s+a\s+([a-zà-ú]+)ar\b/gi, (_m, v, r) => `${v} ${r}ando`],
  [/\b(está|estás|estou|estamos|estão|estava|estavam|esteve)\s+a\s+([a-zà-ú]+)er\b/gi, (_m, v, r) => `${v} ${r}endo`],
  [/\b(está|estás|estou|estamos|estão|estava|estavam|esteve)\s+a\s+([a-zà-ú]+)ir\b/gi, (_m, v, r) => `${v} ${r}indo`],
  [/\b(continua|continuam|fica|ficam|anda|andam)\s+a\s+([a-zà-ú]+)ar\b/gi, (_m, v, r) => `${v} ${r}ando`],
  [/\b(continua|continuam|fica|ficam|anda|andam)\s+a\s+([a-zà-ú]+)er\b/gi, (_m, v, r) => `${v} ${r}endo`],
  [/\b(continua|continuam|fica|ficam|anda|andam)\s+a\s+([a-zà-ú]+)ir\b/gi, (_m, v, r) => `${v} ${r}indo`],
  [/\bvoltar a ([a-zà-ú]+)ar\b/gi, (_m, r) => `${r}ar de novo`],
  // «A salvar…» num spinner é a mesma construção sem o verbo à frente.
  [/(^|[^\p{L}])A ([a-zà-ú]{3,})ar(?![\p{L}])/gu, (_m, a, r) => `${a}${r.charAt(0).toUpperCase()}${r.slice(1)}ando`],
];

const REGRAS = [...GERUNDIO, ...LEXICO];

const converte = (t) => REGRAS.reduce((acc, [re, to]) => acc.replace(re, to), t);

/** Só literais de string e texto JSX. Os identificadores ficam intactos. */
function transforma(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === '/' && src[i + 1] === '/') {
      const fim = src.indexOf('\n', i);
      const j = fim === -1 ? n : fim;
      const bloco = src.slice(i, j);
      out += COMENTARIOS ? converte(bloco) : bloco;
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const fim = src.indexOf('*/', i + 2);
      const j = fim === -1 ? n : fim + 2;
      const bloco = src.slice(i, j);
      out += COMENTARIOS ? converte(bloco) : bloco;
      i = j;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      const aspas = c;
      let j = i + 1;
      let corpo = '';
      out += aspas;
      while (j < n) {
        if (src[j] === '\\') {
          corpo += src[j] + (src[j + 1] ?? '');
          j += 2;
          continue;
        }
        if (src[j] === aspas) break;
        if (aspas !== '`' && src[j] === '\n') break;
        // `${…}` é código, não texto: copia-se tal e qual, com chavetas aninhadas
        if (aspas === '`' && src[j] === '$' && src[j + 1] === '{') {
          out += converte(corpo);
          corpo = '';
          let nivel = 0;
          const inicio = j;
          while (j < n) {
            if (src[j] === '{') nivel += 1;
            else if (src[j] === '}') {
              nivel -= 1;
              if (nivel === 0) {
                j += 1;
                break;
              }
            }
            j += 1;
          }
          out += src.slice(inicio, j);
          continue;
        }
        corpo += src[j];
        j += 1;
      }
      out += converte(corpo) + (src[j] ?? '');
      i = j + 1;
      continue;
    }

    // Texto JSX: entre > e <, quando não há chavetas.
    //
    // O `>` de uma etiqueta nunca vem depois de espaço nem de `=`, e o `<` que
    // fecha o texto vem sempre colado ao nome da etiqueta. Sem estes dois
    // guardas, `guardado > 0 && guardado < actions.length` era lido como texto
    // e a substituição partia o código.
    // Uma etiqueta JSX multilinha fecha com o `>` sozinho na linha, com espaços
    // à frente. Um `>` a meio de uma linha com código antes é uma comparação.
    const inicioLinha = src.lastIndexOf('\n', i - 1);
    const soEspacoAntes = src.slice(inicioLinha + 1, i).trim() === '';
    if (
      c === '>' &&
      src[i - 1] !== '=' &&
      src[i - 1] !== '<' &&
      (soEspacoAntes || src[i - 1] !== ' ')
    ) {
      const fim = src.indexOf('<', i + 1);
      if (fim > i + 1 && /[/A-Za-z]/.test(src[fim + 1] ?? '')) {
        const texto = src.slice(i + 1, fim);
        if (!texto.includes('{') && !texto.includes('}') && /[a-zà-ú]{3}/i.test(texto)) {
          out += '>' + converte(texto);
          i = fim;
          continue;
        }
      }
    }

    out += c;
    i += 1;
  }
  return out;
}

const ALVOS = [
  ...globSync('components/**/*.{ts,tsx}'),
  ...globSync('modules/**/*.ts'),
  ...globSync('app/**/*.{ts,tsx}'),
  ...globSync('lib/*.ts'),
].filter((f) => !f.includes('database.types'));

let mudados = 0;
for (const f of ALVOS) {
  const src = readFileSync(f, 'utf8');
  const novo = transforma(src);
  if (novo === src) continue;
  mudados += 1;
  if (WRITE) writeFileSync(f, novo);
  else console.log(f);
}
console.log(`${mudados} arquivos ${WRITE ? 'reescritos' : 'mudariam'}`);
