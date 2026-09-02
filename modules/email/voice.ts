/** Como ela escreve, e em que língua.
 *
 *  Duas funções puras que o serviço de triagem usa e que valem um teste
 *  próprio: uma decide a língua da conversa a partir da conversa, e a outra
 *  nomeia o que ela corrigiu num rascunho.
 *
 *  A segunda é a memória de voz. Antes, cada correcção que a Carol fazia era
 *  deitada fora — e o rascunho seguinte voltava a sair em português do Brasil.
 *  Aprende ESTILO. Nunca política comercial: um modelo que aprende a baixar o
 *  preço porque ela o baixou uma vez é um modelo a decidir dinheiro. */

/** A língua da conversa sai da conversa, não da preferência do modelo.
 *
 *  Um domínio `.pt`, ou português europeu no texto, manda escrever em pt-PT.
 *  Foi assim que um rascunho para a Cecotec saiu com «Oi, Julia! Tudo bem?». */
export function languageOfThread(input: {
  participants: readonly string[];
  externalText: string;
  carolText: string;
}): 'pt-PT' | 'pt-BR' | 'en' | 'other' {
  const dominios = input.participants.map((p) => p.split('@')[1] ?? '').join(' ').toLowerCase();
  const texto = `${input.externalText} ${input.carolText}`.toLowerCase();

  const marcasPT = /(telem[óo]vel|ecr[ãa]|fich(eiro|eiros)|equipa|s[íi]tio|pretende|contact[oa]|estamos a |gostar[íi]amos de |obrigad[oa] pela)/;
  const marcasBR = /(celular|tela|arquivo|time de|site de|voc[êe]s?|a gente|legal|valeu|abra[çc]o)/;
  const marcasEN = /\b(hi|hello|thanks|regards|we would|could you|looking forward)\b/;

  if (/\.pt\b/.test(dominios) || marcasPT.test(texto)) return 'pt-PT';
  if (/\.br\b/.test(dominios) || marcasBR.test(texto)) return 'pt-BR';
  if (marcasEN.test(texto) && !/[ãõçáéí]/.test(texto)) return 'en';
  // Sem sinal, o padrão dela: as marcas com que fala são portuguesas.
  return 'pt-PT';
}

/** O que mudou entre o que se escreveu e o que ela enviou, dito em padrões.
 *
 *  Guardar os dois textos inteiros e mandá-los ao modelo todas as vezes era
 *  caro e vago. Isto nomeia o que se repete, que é o que serve para corrigir. */
export function observeEdit(ai: string, final: string): string[] {
  const notas: string[] = [];
  const brasileirismos: [RegExp, string][] = [
    [/\boi\b/i, '«oi» → «olá»'],
    [/tudo bem\?/i, '«tudo bem?» → «tudo certo?»'],
    [/\bme conta\b/i, '«me conta» → «diga-me» ou «conte-me»'],
    // Sem `\b`: em JavaScript a fronteira de palavra só conhece [A-Za-z0-9_],
    // por isso o «ê» já é fora da palavra e `\bvocê\b` nunca casa. O mesmo
    // erro estava no teste de voz da interface e passava por não achar nada.
    [/(^|[^\p{L}])voc[êe]($|[^\p{L}])/iu, '«você» → tratamento por «si» ou sem sujeito'],
    [/\ba gente\b/i, '«a gente» → «nós»'],
    [/\bcelular\b/i, '«celular» → «telemóvel»'],
    [/\btela\b/i, '«tela» → «ecrã»'],
    [/\barquivo\b/i, '«arquivo» → «ficheiro»'],
  ];
  for (const [re, nota] of brasileirismos) {
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
