/** Os prompts do Production Pack — um por tipo de pack.
 *
 *  Um prompt por tipo, e não um «gera o roteiro» com quinze ramos: pedir fala
 *  frase por frase e pedir composição de slide são tarefas opostas, e juntá-las
 *  é como o modelo começa a escrever legenda de carrossel dentro de um Reel.
 *
 *  A Source of Truth não entra aqui. O que entra é a regra já em código mais o
 *  material real dela — fatos confirmados e citações. O repositório é público.
 *
 *  Versão imutável por prompt. */

import type { Prompt } from '@/modules/ai/gateway';
import { OBJECTIVE_LABEL, PILLAR, type Objective, type Pillar } from './editorial';
import { PACK_DELIVERABLES, PACK_SCHEMA, type PackKind } from './pack';
import { ANTI_PERSONA } from './taste';

export type PackPromptInput = {
  topic: string;
  angle: string;
  pillar: Pillar;
  objective: Objective;
  /** Fatos confirmados por ela. É a única matéria-prima autorizada. */
  facts: readonly string[];
  /** Palavras dela, literais. */
  quotes: readonly string[];
  /** Estrutura observada numa referência, quando a peça carrega hipótese. */
  reference?: string | null;
  /** O que o teste quer responder, quando existe teste. */
  experiment?: string | null;
};

const NEVER_INVENT = `
REGRA QUE NÃO SE QUEBRA:
- Só podes usar os fatos confirmados e as citações abaixo.
- Não inventes acontecimento, diálogo, reação, número, marca nem resultado.
- O que ela não disse, não existe. Campo sem matéria-prima fica vazio.
- Português do Brasil, natural, como quem conta o que aconteceu.
`.trim();

const NOT_A_TEACHER = `
Ela documenta, não ensina. Nada de «se você é creator», «5 dicas», «você
precisa», «o erro que você comete». Ela conta a experiência dela, a decisão
dela, o bastidor e o que aprendeu vivendo. Conselho só na primeira pessoa.
`.trim();

const ANTI = `Sinais de texto errado: ${ANTI_PERSONA.join('; ')}.`;

const FOCUS = `
Os posts têm objetivo. Este é ${'${objetivo}'}. O CTA só entra se servir a esse
objetivo; caso contrário devolve null.
`.trim();

/** O bloco específico de cada tipo. É aqui que o pack deixa de ser genérico. */
const GUIDE: Record<PackKind, string> = {
  spoken_reel: `
Escreve um Reel falado. A fala vai FRASE POR FRASE, uma entrada por frase que
ela vai dizer — é preferência explícita dela e não se resume em parágrafo.
Cenas só quando a peça muda de lugar. B-roll só quando melhora a compreensão.
Direção de performance curta, por frase, quando fizer diferença.`,
  tech_ugc: `
É um Tech UGC: conteúdo para um app ou software. Prioriza que se entenda o
produto, a situação de uso real, o argumento e a fala natural de consumidora.
Diz o que a gravação de tela tem de mostrar. Estética não é objetivo aqui.`,
  canvas_ugc: `
É um Canvas UGC: curto, rápido, mecânica de formato que já circula, adaptada
para marca tech. Preserva a mecânica e a leveza. NÃO transformes isto num
roteiro cinematográfico: nada de decupagem longa nem direção de fotografia.`,
  carousel: `
É um carrossel. Capa com gancho e hierarquia, depois slide a slide com o texto
final — não resumo do slide, o texto que vai aparecer. Diz a composição de cada
slide e que assets são precisos.`,
  photo_sequence: `
É uma sequência de fotos. Para cada foto: que função narrativa cumpre, que
seleção é precisa e que tratamento. NÃO uses lógica de roteiro de vídeo: não há
hook falado nem beats.`,
  story_sequence: `
É uma sequência de Stories. Para cada frame: que função cumpre, o que ela diz
ou escreve, e o que liga ao frame seguinte. Enquete ou caixa de perguntas SÓ se
houver motivo real ligado ao objetivo — e então o motivo vai no campo.`,
};

const render = (i: PackPromptInput) => `
ASSUNTO: ${i.topic}
ÂNGULO: ${i.angle}
PILAR: ${PILLAR[i.pillar].label}
OBJETIVO: ${OBJECTIVE_LABEL[i.objective]}

FATOS CONFIRMADOS POR ELA:
${i.facts.length ? i.facts.map((f, n) => `[${n}] ${f}`).join('\n') : '(nenhum)'}

PALAVRAS DELA, LITERAIS:
${i.quotes.length ? i.quotes.map((q) => `- "${q}"`).join('\n') : '(nenhuma)'}
${i.reference ? `\nESTRUTURA OBSERVADA NUMA REFERÊNCIA (copia a engenharia, nunca o assunto):\n${i.reference}` : ''}
${i.experiment ? `\nESTA PEÇA CARREGA UM TESTE: ${i.experiment}` : ''}
`.trim();

function build(kind: PackKind): Prompt<PackPromptInput, unknown> {
  return {
    task: `content_pack_${kind}`,
    version: 'v1',
    tier: 'reasoning',
    schema: PACK_SCHEMA[kind],
    system: [
      `Preparas o material de produção de uma peça da Carol. Entregáveis deste tipo: ${PACK_DELIVERABLES[kind].join(', ')}.`,
      GUIDE[kind].trim(),
      NEVER_INVENT,
      NOT_A_TEACHER,
      ANTI,
      FOCUS,
    ].join('\n\n'),
    render,
    maxTokens: 3000,
  };
}

export const PACK_PROMPT: Record<PackKind, Prompt<PackPromptInput, unknown>> = {
  spoken_reel: build('spoken_reel'),
  tech_ugc: build('tech_ugc'),
  canvas_ugc: build('canvas_ugc'),
  carousel: build('carousel'),
  photo_sequence: build('photo_sequence'),
  story_sequence: build('story_sequence'),
};
