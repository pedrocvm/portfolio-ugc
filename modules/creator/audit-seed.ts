/** O que a auditoria observou, embutido.
 *
 *  A auditoria vive em `docs.local/`, que está fora do repositório — em
 *  produção esse arquivo não existe. O que interessa dela tem de estar aqui,
 *  em código, ou o sistema em produção não sabe nada disto.
 *
 *  Três coisas: o retrato de criadora que foi mesmo observado, as trinta ideias
 *  como banco de arranque, e os dez roteiros como exemplares de voz.
 *
 *  As ideias entram como SEMENTE, nunca como tarefas. Trinta cartões numa tela
 *  é o oposto do que o Morning Autopilot existe para fazer. */

import type { Pillar } from './strategy';

export const AUDIT_PROVENANCE = 'Auditoria Instagram · 02/09/2026';

/* ── O retrato, como foi observado ────────────────────────────────────────── */

/** Isto NÃO é inferência: cada linha sai de uma peça vista ou de uma frase do
 *  site dela. Por isso a cobertura é `observed` — quinze posts é o catálogo
 *  inteiro, não uma amostra, e os sete criativos foram vistos na íntegra. */
export const OBSERVED_PROFILE = {
  handle: '@carolxqueiroz',
  coverage: 'observed' as const,
  sampleSize: 22,
  dimensions: {
    camera_presence:
      'Alta quando fala: entra no plano com os olhos abertos, admite ceticismo. Desaparece nas montagens mudas.',
    energy: 'Próxima e conversada. Não performa energia de anúncio.',
    tone: 'Amiga que testou, não especialista que palestra. Auto-depreciação leve.',
    humor: 'Cético e seco. Funciona («tava meio emburrada»); não faz humor de sketch.',
    visual_style:
      'Apartamento moderno e cinematográfico, ginásio, praia. Bonito — e é onde ela some se não falar.',
    editing_complexity: 0.6,
    preferred_duration_seconds: 30,
    talking_head_tolerance: 0.85,
    voiceover_usage:
      'Quase ausente, e é o maior desperdício: Sweek, Charabanc e Wella morrem mudos.',
    b_roll_usage: 'Boa: produto na mão, tela do WhatsApp, textura, antes/depois.',
    personal_exposure:
      'Aberta sem ser oversharer: rosácea, período, «emburrada com o namorado». Não faz drama.',
    educational_style:
      'Nenhum, e assim deve ficar. Não é professora; mostra e conclui.',
    storytelling_style:
      'Natural quando o assunto a atravessa: começo, tensão, prova, remate. Metáfora concreta.',
    caption_style: 'Português dela, brasileiro misturado com português europeu. Inglês de stock estraga.',
  },
  topics: [
    'sala e restaurante',
    'atendimento e serviço',
    'testar com ceticismo',
    'casa a dois',
    'rosácea e pele reativa',
    'cabelo estragado',
    'treino de quem começa',
    'mudança de carreira',
    'brasileira em Portugal',
  ],
  successfulFormats: [
    'talking head com história',
    'storytime com prova no plano',
    'antes/depois',
    'reação e ceticismo',
    'opinião',
  ],
  avoidedFormats: [
    'montagem estética muda',
    'lista de funcionalidades',
    'tutorial',
    'lip sync e trend de dança',
    'GRWM de maquilhagem',
    'conteúdo para creators',
  ],
  evidence: [
    'Cenlo (44s): ceticismo, prova no WhatsApp, «tava meio emburrada» — a melhor peça.',
    'The Ordinary (43s): rosácea, metáfora «cidade cheia de incêndios / bombeiro», antes/depois.',
    'Enna (24s): à vontade com tema íntimo, em inglês com erros de tela.',
    'Sweek (21s) e Charabanc (35s): montagens mudas, bonitas, sem ela.',
    'Treino Fácil (60s): lapela à vista, lista de funcionalidades — o formato que mata.',
    'Bio: «Larguei 10 anos de restaurante pra viver do digital» — a melhor frase, nunca filmada.',
    'Site: restaurante dos pais na adolescência, depois fine dining no Porto.',
  ],
};

/* ── As trinta ideias, por pilar ──────────────────────────────────────────── */

export type SeedIdea = { pillar: Pillar; title: string; hook: string; seconds: number };

export const SEED_IDEAS: readonly SeedIdea[] = [
  // A sala
  { pillar: 'A_SALA', title: 'O pedido que eu mais odiava anotar', hook: 'Meio-a-meio com borda e sem cebola só no meio.', seconds: 25 },
  { pillar: 'A_SALA', title: 'Fine dining vs restaurante dos meus pais', hook: 'Dois mundos de serviço, e eu passei pelos dois.', seconds: 30 },
  { pillar: 'A_SALA', title: 'O cliente que diz «é só uma perguntinha»', hook: 'Nunca é só uma perguntinha.', seconds: 20 },
  { pillar: 'A_SALA', title: 'Eu sabia que a mesa 4 ia pedir a conta em 4 minutos', hook: 'Dá para ler uma mesa inteira sem ninguém falar.', seconds: 25 },
  { pillar: 'A_SALA', title: 'O que um serviço de 12 horas faz à cara no dia seguinte', hook: 'A minha pele sabia o turno antes de mim.', seconds: 25 },
  { pillar: 'A_SALA', title: 'Por que pizzaria morre no WhatsApp às 21h', hook: 'A hora em que todo pedido chega junto.', seconds: 35 },
  { pillar: 'A_SALA', title: 'Eu não sou extrovertida. Eu sou treinada.', hook: 'Dez anos de sala fazem isso.', seconds: 20 },
  { pillar: 'A_SALA', title: 'A primeira vez que me pediram o cardápio em inglês no Porto', hook: 'Eu não sabia dizer «bacalhau» em inglês.', seconds: 25 },
  { pillar: 'A_SALA', title: 'Coisa que um maître me ensinou', hook: 'Serviço, não aula de creator.', seconds: 20 },
  // Testei
  { pillar: 'TESTEI', title: 'Testei sem ler o site', hook: 'Se precisa de manual, já falhou.', seconds: 30 },
  { pillar: 'TESTEI', title: 'Fiz o pedido difícil de propósito', hook: 'Eu sei exatamente onde é que isto costuma quebrar.', seconds: 35 },
  { pillar: 'TESTEI', title: 'O brief pedia sorriso. Eu gravei emburrada.', hook: 'E foi esse take que eles escolheram.', seconds: 25 },
  { pillar: 'TESTEI', title: 'Testei o sistema do meu namorado com olhar de sala', hook: 'Passei anos anotando isso sem errar.', seconds: 40 },
  { pillar: 'TESTEI', title: 'Disseram que era fácil. Eu sou a pior pessoa para testar isso.', hook: 'Eu não sou a pessoa zen do copo menstrual.', seconds: 25 },
  { pillar: 'TESTEI', title: 'Máscara de 5 minutos contra cabelo de fim de turno', hook: 'Isto não é cabelo sujo. É cabelo de fecho de restaurante.', seconds: 25 },
  { pillar: 'TESTEI', title: 'App de treino por menos que uma pizza', hook: 'Eu trabalhei com pizza. Vou converter direito.', seconds: 30 },
  // Casa a dois
  { pillar: 'CASA_A_DOIS', title: 'A primeira peça que compramos para esta casa', hook: 'A sala estava vazia. Começou por aqui.', seconds: 25 },
  { pillar: 'CASA_A_DOIS', title: 'Ele escolhe o filme, eu escolho o cheiro', hook: 'É assim que a gente divide a noite.', seconds: 25 },
  { pillar: 'CASA_A_DOIS', title: 'Antes faltava um lugar para ficar', hook: 'Não é que uma mesa mude a casa. É que passou a haver onde ficar.', seconds: 25 },
  { pillar: 'CASA_A_DOIS', title: 'Tour honesto: o que ainda é caixa', hook: 'A casa bonita do Instagram tem caixas atrás da câmera.', seconds: 30 },
  { pillar: 'CASA_A_DOIS', title: 'Domingo a dois sem reserva de restaurante', hook: 'Ironia de quem veio da sala.', seconds: 25 },
  // Corpo
  { pillar: 'CORPO', title: 'A minha pele há três meses', hook: 'Uma cidade cheia de incêndios. O ácido azelaico foi o bombeiro.', seconds: 30 },
  { pillar: 'CORPO', title: 'Rosácea no verão em Portugal', hook: 'Calor, stress, e a bochecha pega fogo.', seconds: 20 },
  { pillar: 'CORPO', title: 'Eu não sei usar este aparelho', hook: 'Sei parecer que treino. Não sei por onde começar.', seconds: 20 },
  { pillar: 'CORPO', title: 'Cabelo assim é hora da máscara', hook: 'Conto os cinco minutos como contava o último pedido.', seconds: 20 },
  { pillar: 'CORPO', title: 'O que o stress do serviço fazia à minha pele', hook: 'E eu achava que era normal.', seconds: 25 },
  // Larguei o turno
  { pillar: 'LARGUEI_O_TURNO', title: 'O silêncio depois de dez anos de sala', hook: 'O som que mais me assusta agora é nenhum.', seconds: 20 },
  { pillar: 'LARGUEI_O_TURNO', title: 'Um dia sem serviço, com uma tese', hook: 'Hoje eu não servi ninguém.', seconds: 30 },
  { pillar: 'LARGUEI_O_TURNO', title: 'Larguei o restaurante e ainda conto o tempo em covers', hook: 'Ninguém me avisou dessa parte.', seconds: 25 },
  { pillar: 'LARGUEI_O_TURNO', title: 'PB, Porto, Braga', hook: 'Ninguém acerta no meu sotaque à primeira.', seconds: 25 },
];

/* ── Os dez roteiros, como exemplares de voz ──────────────────────────────── */

/** Não são modelos a preencher. São o que ela soa quando está certa, e o
 *  planeador recebe-os para calibrar a voz — como o perfil de estilo dos
 *  emails já faz com as mensagens reais dela. */
export const EXEMPLAR_SCRIPTS: readonly { id: string; pillar: Pillar; text: string }[] = [
  {
    id: 'R1',
    pillar: 'TESTEI',
    text: 'Meio pepperoni, meio frango, borda, sem cebola só no frango. Isso, num papel, era o meu terror. Passei anos anotando sem errar o sabor. Meu namorado passou meses ensinando um WhatsApp a fazer o mesmo. Fui testar sem facilitar: pedi o que eu tinha deixado de fora. No fim apareceu o total. Vou ter que admitir — o pedido saiu mais limpo do que muita noite minha.',
  },
  {
    id: 'R2',
    pillar: 'LARGUEI_O_TURNO',
    text: 'O som que mais me assusta agora é nenhum. Dez anos vivendo em «já vai». Pais, depois fine dining no Porto. Larguei. A casa fica silenciosa e as minhas mãos ainda procuram o bloco.',
  },
  {
    id: 'R3',
    pillar: 'CORPO',
    text: 'Isso era três meses atrás. Quem tem rosácea sabe: um calor, um estresse, e a bochecha vira uma cidade cheia de incêndios. Esse ácido azelaico tem sido o bombeiro.',
  },
  {
    id: 'R4',
    pillar: 'CASA_A_DOIS',
    text: 'A sala estava vazia. A primeira coisa que a gente fez junto foi essa. Não é que uma mesa mude uma casa — é que finalmente tem um lugar onde a gente fica. Trabalho, jantar, mão dada. Eu vinha de anos em que a mesa era dos outros.',
  },
  {
    id: 'R5',
    pillar: 'TESTEI',
    text: 'Eu estava irritada. Ele de novo no computador. Fui testar aquilo esperando achar defeito. Valeu a pena — e eu odiava ter razão contra ele e não ter.',
  },
  {
    id: 'R6',
    pillar: 'CORPO',
    text: 'Eu sei parecer que treino. Não sei por onde começar. Não preciso de motivação: preciso de alguém que me mostre o aparelho sem me humilhar. Não é mágica, é não ficar parada no meio da academia.',
  },
  {
    id: 'R7',
    pillar: 'TESTEI',
    text: 'Eu não sou a pessoa zen do coletor menstrual. Achei que ia ser complicado. Não foi. Trabalho, treino, saio, e esqueço. A liberdade foi a parte que eu não esperava.',
  },
  {
    id: 'R8',
    pillar: 'CORPO',
    text: 'Isso não é cabelo sujo. É cabelo de fechamento de restaurante. Cinco minutos de máscara — eu conto no relógio como contava o último pedido. Depois disso, o cabelo se comporta.',
  },
  {
    id: 'R9',
    pillar: 'TESTEI',
    text: 'A marca pediu sorriso no segundo 1. Eu entrei emburrada. Porque se eu não acredito, o anúncio parece anúncio. Gravei como se estivesse contando pra minha irmã. Ficaram com esse.',
  },
  {
    id: 'R10',
    pillar: 'LARGUEI_O_TURNO',
    text: 'PB. Porto. Braga. Ninguém acerta de primeira. Cinco anos aqui e ainda me perguntam se eu já me acostumei. Eu me acostumei a servir. Com a chuva ainda não.',
  },
];

/** Os exemplares, ditos ao modelo. Serve de calibração de voz, e diz
 *  explicitamente que não são para copiar — o mesmo cuidado que o perfil de
 *  estilo dos emails já tinha. */
export function describeExemplars(): string {
  return [
    'Roteiros que soam a ela. Servem para calibrar a VOZ, nunca para reciclar frases:',
    ...EXEMPLAR_SCRIPTS.map((e) => `- [${e.pillar}] ${e.text}`),
  ].join('\n');
}

/** Os exemplares vistos como coisas que já existem.
 *
 *  O prompt diz «servem para calibrar a VOZ, nunca para reciclar frases», e
 *  isso não chegava: assim que as sementes deixaram de bloquear tudo, o modelo
 *  devolveu o exemplar R4 quase palavra a palavra — «A sala estava vazia. A
 *  primeira coisa que fizemos juntos foi isto». Uma instrução não é um portão.
 *
 *  Não têm impressão digital porque nunca foram ideias; o que os identifica é o
 *  texto, e é sobre o texto que `isRepeat` decide. */
export function exemplarsAsPrevious(): { fingerprint: string; hook: string }[] {
  return EXEMPLAR_SCRIPTS.map((e) => ({ fingerprint: `exemplar:${e.id}`, hook: e.text }));
}
