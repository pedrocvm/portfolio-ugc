/** Como ela escreve, e em que língua.
 *
 *  Duas funções puras que o serviço de triagem usa e que valem um teste
 *  próprio: uma decide a língua da conversa a partir da conversa, e a outra
 *  nomeia o que ela corrigiu num rascunho.
 *
 *  A segunda é a memória de voz. Antes, cada correção que a Carol fazia era
 *  jogada fora — e o rascunho seguinte voltava a sair errado. Aprende ESTILO.
 *  Nunca política comercial: um modelo que aprende a baixar o preço porque ela
 *  o baixou uma vez é um modelo decidindo dinheiro. */

/** Português ou inglês. Nunca português europeu.
 *
 *  A regra do projeto é PT-BR em qualquer caso — inclusive numa conversa com
 *  uma marca portuguesa, que é a maioria delas. A escolha aqui é só entre
 *  escrever na língua dela ou em inglês; a variante já está decidida. */
export function languageOfThread(input: {
  participants: readonly string[];
  externalText: string;
  carolText: string;
}): 'pt-BR' | 'en' | 'other' {
  const texto = `${input.externalText} ${input.carolText}`.toLowerCase();
  const marcasEN = /\b(hi|hello|thanks|regards|we would|could you|looking forward)\b/;

  if (marcasEN.test(texto) && !/[ãõçáéí]/.test(texto)) return 'en';
  return 'pt-BR';
}

/** O que mudou entre o que se escreveu e o que ela enviou, dito em padrões.
 *
 *  Guardar os dois textos inteiros e mandá-los ao modelo todas as vezes era
 *  caro e vago. Isto nomeia o que se repete, que é o que serve para corrigir. */
export function observeEdit(ai: string, final: string): string[] {
  const notas: string[] = [];
  // Sem `\b` à volta de palavra acentuada: em JavaScript a fronteira de palavra
  // só conhece [A-Za-z0-9_], por isso «ã» já conta como fora da palavra e
  // `\becrã\b` nunca casa. O mesmo erro passou despercebido no teste de voz da
  // interface, que passava por não achar nada.
  const lusitanismos: [RegExp, string][] = [
    [/(^|[^\p{L}])telem[óo]ve(l|is)($|[^\p{L}])/iu, '«telemóvel» → «celular»'],
    [/(^|[^\p{L}])ecrãs?($|[^\p{L}])/iu, '«ecrã» → «tela»'],
    [/(^|[^\p{L}])ficheiros?($|[^\p{L}])/iu, '«ficheiro» → «arquivo»'],
    [/(^|[^\p{L}])portef[óo]lio($|[^\p{L}])/iu, '«portefólio» → «portfólio»'],
    [/\bequipa\b/i, '«equipa» → «equipe»'],
    [/\bde si\b/i, '«de si» → «de você»'],
    [/\bcontact(o|ar)\b/i, '«contacto» → «contato»'],
    [/\bestá a [a-zà-ú]+[aei]r\b/i, '«está a fazer» → «está fazendo»'],
    [/\bdiga-me\b/i, '«diga-me» → «me diga»'],
  ];
  for (const [re, nota] of lusitanismos) {
    if (re.test(ai) && !re.test(final)) notas.push(`tira ${nota}`);
  }

  const palavrasAi = ai.trim().split(/\s+/).length;
  const palavrasFinal = final.trim().split(/\s+/).length;
  if (palavrasFinal < palavrasAi * 0.7) notas.push('encurta: escreve bastante menos do que o rascunho');
  if (palavrasFinal > palavrasAi * 1.4) notas.push('alonga: acrescenta contexto que o rascunho não trazia');

  const emojisAi = (ai.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const emojisFinal = (final.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojisAi > emojisFinal) notas.push('usa menos emoji do que o rascunho');
  if (emojisFinal > emojisAi) notas.push('acrescenta emoji ao rascunho');

  if (/!/.test(ai) && !/!/.test(final)) notas.push('tira pontos de exclamação');

  return notas;
}
