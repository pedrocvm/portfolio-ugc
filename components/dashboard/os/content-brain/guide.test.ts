import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { GUIDE_STEPS, TEACHING_STEPS } from '@/modules/content-brain/guide';

/** O guia, verificado como texto.
 *
 *  Os componentes puxam React e `next/navigation` para dentro do runner e o
 *  projeto não tem DOM nos testes — é a mesma escolha que `copy.test.ts` já
 *  faz. O que se verifica aqui são as propriedades que uma regressão real
 *  quebraria em silêncio: uma etapa que desaparece, um botão que passa a
 *  gravar, um modal que deixa de prender o foco.
 *
 *  A regra do produto que isto protege é uma: NADA do que se vê dentro do guia
 *  toca a base. Se um dia alguém quiser demonstrar com dados verdadeiros, o
 *  teste falha antes de a primeira história falsa entrar em `creator_story`. */

const ROOT = path.join(import.meta.dirname, '..', '..', '..', '..');
const ler = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const GUIA = ler('components/dashboard/os/content-brain/ContentGuide.tsx');
const CENAS = ler('components/dashboard/os/content-brain/GuideScenes.tsx');
const CSS = ler('app/dashboard/content-brain.css');

/* ── As etapas ────────────────────────────────────────────────────────────── */

test('cada etapa do domínio tem uma tela no guia', () => {
  for (const step of GUIDE_STEPS) {
    assert.match(GUIA, new RegExp(`step: '${step}'`), `falta a tela «${step}»`);
    assert.match(CENAS, new RegExp(`^  ${step}: `, 'm'), `falta a cena «${step}»`);
  }
});

test('o contador conta as oito etapas de ensino, não as nove telas', () => {
  assert.match(GUIA, /de \$\{TEACHING_STEPS\}/);
  assert.equal(TEACHING_STEPS + 1, GUIDE_STEPS.length);
});

test('a primeira tela não tem «Anterior» e a última troca o botão pelo CTA', () => {
  assert.match(GUIA, /isFirstGuideStep\(passo\) \? null : \(/);
  assert.match(GUIA, /Quero começar com uma história/);
  assert.match(GUIA, /Fechar guia/);
});

test('o convite da primeira visita tem as duas saídas e não abre nada sozinho', () => {
  assert.match(GUIA, /Me mostra/);
  assert.match(GUIA, /Agora não/);
  // Abrir é sempre consequência de um clique: nenhum efeito chama `abrir`.
  assert.equal(/useEffect\([^)]*\)\s*=>\s*\{[^}]*abrir\(/.test(GUIA), false);
});

test('o CTA final abre o fluxo verdadeiro, não uma cópia', () => {
  assert.match(GUIA, /import StoryWorkshop from '\.\/StoryWorkshop'/);
  assert.match(GUIA, /<StoryWorkshop focus=\{focus\} autoOpen/);
});

/* ── Nada de demonstração é gravado ───────────────────────────────────────── */

const ESCRITAS = [
  'tellStory',
  'captureStory',
  'confirmStoryFacts',
  'saveStoryMeaning',
  'structureThisStory',
  'markReadyToRecord',
  'chooseDirection',
  'chooseStoryPoint',
  'writeScript',
  'answerCandidate',
  'createSeries',
];

test('o guia não chama nenhuma ação que escreva história, ideia ou desempenho', () => {
  for (const fn of ESCRITAS) {
    assert.equal(GUIA.includes(fn), false, `o guia chama «${fn}»`);
    assert.equal(CENAS.includes(fn), false, `a cena chama «${fn}»`);
  }
});

test('a única coisa que o guia salva é onde ela parou', () => {
  const importadas = GUIA.match(/from '@\/app\/dashboard\/[^']+'/g) ?? [];
  assert.deepEqual(importadas, ["from '@/app/dashboard/content-brain-actions'"]);
  const nomes = [...GUIA.matchAll(/import \{ ([^}]+) \} from '@\/app\/dashboard\//g)].flatMap((m) =>
    m[1].split(',').map((n) => n.trim()),
  );
  assert.deepEqual(nomes, ['saveGuideProgress']);
});

test('as cenas não importam ação nenhuma nem tocam na base', () => {
  assert.equal(/from '@\/app\//.test(CENAS), false);
  assert.equal(/supabase/i.test(CENAS), false);
});

test('as cenas são ilustração: nada operável, nada submetível', () => {
  for (const proibido of ['<button', '<input', '<form', '<textarea', 'onClick', 'href=']) {
    assert.equal(CENAS.includes(proibido), false, `a cena tem «${proibido}»`);
  }
  // E o leitor de tela lê a explicação, não uma tela falsa.
  assert.match(CENAS, /aria-hidden="true"/);
});

/* ── Acessibilidade ───────────────────────────────────────────────────────── */

test('o modal é um diálogo com nome, foco preso e saída por Escape', () => {
  assert.match(GUIA, /role="dialog"/);
  assert.match(GUIA, /aria-modal="true"/);
  assert.match(GUIA, /aria-labelledby="cbGuideTitle"/);
  assert.match(GUIA, /id="cbGuideTitle"/);
  assert.match(GUIA, /e\.key === 'Escape'/);
  assert.match(GUIA, /e\.key !== 'Tab'/);
  assert.match(GUIA, /preventDefault\(\)/);
});

test('o foco volta ao botão que abriu o guia', () => {
  assert.match(GUIA, /veioDe\.current = document\.activeElement/);
  assert.match(GUIA, /\(antes \?\? botao\.current\)\?\.focus\?\.\(\)/);
});

test('a barra de progresso diz onde está, por extenso', () => {
  assert.match(GUIA, /role="progressbar"/);
  assert.match(GUIA, /aria-valuetext=/);
  assert.match(GUIA, /aria-valuenow=/);
});

test('o botão de fechar tem nome, porque «×» não é nome', () => {
  assert.match(GUIA, /aria-label="Fechar o guia"/);
});

test('quem pediu menos movimento não recebe nenhum', () => {
  const bloco = CSS.slice(CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  for (const classe of ['.cbGuide,', '.cbGuideBox,', '.cbGuideBody', '.cbGuideBar span']) {
    assert.ok(bloco.includes(classe), `${classe} continua a mexer-se em reduced-motion`);
  }
});

/* ── Ajuda contextual ─────────────────────────────────────────────────────── */

/** Os seis lugares onde há risco real de não se entender. Um `?` em cada
 *  elemento seria ruído; menos do que estes seis deixa a Carol sem resposta
 *  exatamente onde ela pergunta. */
const AJUDA: [string, string][] = [
  ['components/dashboard/os/content-brain/StoryCapture.tsx', 'Por que estou fazendo isso?'],
  ['components/dashboard/os/content-brain/StoryWorkshop.tsx', 'Por que preciso confirmar?'],
  ['components/dashboard/os/content-brain/StoryWorkshop.tsx', 'O que acontece depois?'],
  ['components/dashboard/os/ContentVault.tsx', 'Quando uma série vale a pena?'],
  ['components/dashboard/os/RecordingMode.tsx', 'Por que não vejo a estratégia aqui?'],
  ['components/dashboard/os/content-brain/Performance.tsx', 'O que acontece depois de publicar?'],
];

test('a ajuda contextual existe nos seis lugares de maior confusão', () => {
  for (const [arquivo, pergunta] of AJUDA) {
    const src = ler(arquivo);
    assert.ok(src.includes(`question="${pergunta}"`), `${arquivo} perdeu «${pergunta}»`);
  }
});

test('a ajuda não manda ninguém para fora da tela', () => {
  const ajuda = ler('components/dashboard/os/content-brain/HelpNote.tsx');
  assert.equal(/<a |href=|Link/.test(ajuda), false);
  assert.match(ajuda, /<details/);
});

test('a resposta da confirmação é a regra do produto, não uma paráfrase', () => {
  const src = ler('components/dashboard/os/content-brain/StoryWorkshop.tsx');
  assert.match(
    src.replace(/\s+/g, ' '),
    /só pode estruturar conteúdo pessoal a partir de algo que realmente aconteceu/,
  );
});

/* ── O Hoje não fica bloqueado ────────────────────────────────────────────── */

test('a recomendação do Hoje é uma recomendação, e a ação real continua primeiro', () => {
  const src = ler('components/dashboard/os/MorningFlow.tsx');
  const dica = src.indexOf('Primeira vez?');
  const acao = src.indexOf('Ver o plano');
  assert.ok(dica > 0, 'a recomendação sumiu do Hoje');
  assert.ok(dica < acao, 'a recomendação passou à frente da ação real');
  assert.match(src, /\{guideSeen \? null : \(/);
});
