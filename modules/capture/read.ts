/** O que dizer à Carol sobre uma coisa que ela capturou.
 *
 *  O cartão mostrava o que o extractor não conseguiu, pelos nomes dos campos:
 *  «Não consegui apurar: instagram_handle, contact_name, contact_email,
 *  contact_role, product_name, product_price_cents, country_code.» Sete
 *  palavras em inglês com underscores, uma percentagem de confiança, e uma
 *  etiqueta a dizer LINK — três coisas que são o sistema a falar de si próprio,
 *  e zero coisas sobre se aquela marca lhe serve para alguma coisa.
 *
 *  A pergunta que ela tem quando cola um link é sempre a mesma: **isto é para
 *  mim?** Este módulo responde-a com o que já se sabe, e diz o que falta só
 *  quando faltar alguma coisa que a impeça de avançar.
 *
 *  Puro. Recebe a extração e o foco dela; devolve frases. */

import { focusMatch, stem, tokens } from '@/modules/outreach/intent';
import { isExcludedNiche, nicheById } from '@/modules/brands/niches';

export type CaptureFacts = {
  brandName: string | null;
  website: string | null;
  instagramHandle: string | null;
  contactEmail: string | null;
  contactName: string | null;
  productName: string | null;
  nicheId: string | null;
  summary: string;
  asks: readonly string[];
};

export type Fit =
  | { verdict: 'match'; line: string; niche: string }
  | { verdict: 'excluded'; line: string }
  | { verdict: 'unsure'; line: string };

export type CaptureRead = {
  /** O nome, ou o domínio, ou nada — mas nunca «null» à vista. */
  title: string;
  /** O que é, numa frase. Vazio quando não se sabe: melhor calar do que encher. */
  what: string;
  fit: Fit;
  /** O que o sistema tem, já legível. */
  known: { label: string; value: string }[];
  /** O que vai acontecer a seguir se ela criar. Substitui a lista de ausências:
   *  ela não precisa de saber que campos ficaram vazios, precisa de saber que
   *  alguém trata deles. */
  next: string;
  /** O que só ela pode responder, em português. Vazio quase sempre. */
  blocking: string[];
};

/** Tira o ruído de um endereço para caber numa linha: sem protocolo, sem
 *  `www.`, sem os parâmetros que a loja usa para saber de onde vieste. */
export function tidyUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const texto = raw.trim();
  if (!texto) return null;
  try {
    const u = new URL(texto.startsWith('http') ? texto : `https://${texto}`);
    const caminho = u.pathname.replace(/\/+$/, '');
    return `${u.hostname.replace(/^www\./, '')}${caminho}`;
  } catch {
    return texto.replace(/^https?:\/\//, '').replace(/^www\./, '').split('?')[0];
  }
}

/** O texto onde se procura o encaixe: tudo o que descreve a marca, junto. */
const describeText = (f: CaptureFacts) =>
  [f.brandName, f.summary, f.productName, nicheById(f.nicheId).label].filter(Boolean).join(' ');

/** Isto é para ela?
 *
 *  Três respostas, e a do meio é a que mais importa: skincare e haircare estão
 *  fora por decisão de produto, e dizê-lo aqui poupa-lhe criar a marca para
 *  descobrir depois. */
export function readFit(f: CaptureFacts, focusLabels: readonly string[]): Fit {
  if (isExcludedNiche(f.nicheId)) {
    return {
      verdict: 'excluded',
      line: `${nicheById(f.nicheId).label} está fora da sua estratégia. Pode criar na mesma, mas não vai aparecer em prospecção.`,
    };
  }

  const texto = describeText(f);
  const m = focusMatch(texto, focusLabels);
  if (!m.matches) {
    return {
      verdict: 'unsure',
      line: 'Não é nenhum dos nichos que procura — o que não quer dizer que não preste, só que não vem por aí.',
    };
  }

  // O `focusMatch` responde «pertence a algum nicho do foco» e devolve o
  // primeiro rótulo que o reclamou. Reclamam por família: uma loja de gadgets
  // sai como «SaaS e software», porque software e gadgets são a mesma família
  // de tecnologia. Isso chega para pontuar uma candidata, e não chega para
  // escrever uma frase — dizer-lhe que uma loja de aspiradores encaixa em SaaS
  // é pior do que não dizer nicho nenhum.
  //
  // Por isso o nome só sai quando há uma palavra em comum a sério.
  const nomeado = porPalavra(texto, focusLabels);
  return nomeado
    ? { verdict: 'match', niche: nomeado, line: `Encaixa em ${nomeado.toLowerCase()}, que é um dos nichos que procura.` }
    : { verdict: 'match', niche: '', line: 'Encaixa no que procura.' };
}

/** O rótulo que partilha mesmo uma palavra com o texto da marca, e não só a
 *  família. Devolve o mais longo em comum, para «Consumer tech e gadgets»
 *  ganhar a «Apps» quando ambos casam. */
function porPalavra(texto: string, focusLabels: readonly string[]): string | null {
  const stems = new Set(tokens(texto).map(stem));
  let melhor: { label: string; quantos: number } | null = null;
  for (const label of focusLabels) {
    const quantos = tokens(label).map(stem).filter((t) => stems.has(t)).length;
    if (quantos > 0 && (!melhor || quantos > melhor.quantos)) melhor = { label, quantos };
  }
  return melhor?.label ?? null;
}

/** Só o que existe, e com nomes que se leem. */
function readKnown(f: CaptureFacts): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const site = tidyUrl(f.website);
  if (site) out.push({ label: 'site', value: site });
  if (f.instagramHandle) out.push({ label: 'instagram', value: `@${f.instagramHandle.replace(/^@/, '')}` });
  if (f.contactName || f.contactEmail) {
    out.push({ label: 'contacto', value: f.contactName ?? f.contactEmail! });
  }
  if (f.productName) out.push({ label: 'produto', value: f.productName });
  return out;
}

/** O que o sistema faz a seguir.
 *
 *  Escrito ao contrário da lista de ausências: em vez de sete campos vazios,
 *  uma frase sobre quem trata deles. Só promete o que existe mesmo — a pesquisa
 *  da marca corre ao criar, e o email só se escreve na prospecção. */
function readNext(f: CaptureFacts, fit: Fit): string {
  if (f.asks.length) {
    return 'Já há um pedido nesta conversa, por isso ao criar isto entra também como oportunidade e aparece no Hoje.';
  }
  if (fit.verdict === 'excluded') {
    return 'Fica guardada como registo. Não entra em prospecção nem em sugestões.';
  }
  const temContacto = Boolean(f.contactEmail || f.contactName);
  return temContacto
    ? 'Ao criar, fica com o contacto já ligado e eu procuro o resto.'
    : 'Ao criar, vou procurar quem contactar e o que fazem — não precisa de preencher nada.';
}

/** O que nem o sistema nem a pesquisa conseguem resolver.
 *
 *  Quase sempre vazio, e é esse o ponto. Um nome que não se conseguiu ler é a
 *  única coisa que a impede mesmo de avançar; tudo o resto procura-se depois. */
function readBlocking(f: CaptureFacts): string[] {
  const out: string[] = [];
  if (!f.brandName && !f.website && !f.instagramHandle) {
    out.push('Não consegui perceber de que marca se trata. Escreva o nome e eu procuro o resto.');
  }
  return out;
}

export function readCapture(f: CaptureFacts, focusLabels: readonly string[]): CaptureRead {
  const fit = readFit(f, focusLabels);
  const site = tidyUrl(f.website);

  return {
    title: f.brandName ?? site ?? (f.instagramHandle ? `@${f.instagramHandle}` : 'Marca por identificar'),
    // O resumo do extractor às vezes é só o nome outra vez. Nesse caso não vale
    // a linha que ocupa.
    what:
      f.summary && f.summary.trim().toLowerCase() !== (f.brandName ?? '').trim().toLowerCase()
        ? f.summary.trim()
        : '',
    fit,
    known: readKnown(f),
    next: readNext(f, fit),
    blocking: readBlocking(f),
  };
}
