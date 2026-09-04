import { normalizeDomain, normalizeHandle, normalizeName } from '@/modules/brands/identity';

/** «Já tenho marcas»: a lista que ela colou, entendida.
 *
 *  Este fluxo não é descoberta. A Carol já escolheu — encontrou os hotéis no
 *  Instagram, numa viagem, numa indicação — e o que ela quer é que o CarolOS
 *  pesquise AQUELAS entidades. O sistema pode dizer que o encaixe comercial é
 *  médio; não pode trocar a lista dela por outra melhor, acrescentar SaaS,
 *  nem descartar um hotel por hotelaria não ser o nicho prioritário do mês.
 *
 *  Tudo aqui é puro. É a peça onde um erro se paga em marcas erradas
 *  pesquisadas, e é a única forma de a testar sem rede nem modelo. */

/* ── Quantidade ──────────────────────────────────────────────────────────── */

/** Prospecção artesanal assistida, não infraestrutura de cold email em massa. */
export const IMPORT_LIMITS = { min: 1, max: 25 } as const;

/* ── O que uma linha colada vira ─────────────────────────────────────────── */

export type InputType =
  | 'name' | 'domain' | 'url' | 'instagram' | 'tiktok' | 'linkedin' | 'maps';

export type ImportedBrandCandidate = {
  rawInput: string;
  normalizedInput: string;
  inputType: InputType;
  detectedName: string;
  detectedDomain: string | null;
  detectedInstagram: string | null;
  detectedTiktok: string | null;
  detectedLinkedin: string | null;
  detectedWebsite: string | null;
  countryHint: string | null;
  cityHint: string | null;
  /** 0 a 1. Um @ sozinho não diz o nome da empresa; um domínio quase sempre diz. */
  confidence: number;
};

/** O identificador do lote. Domínio primeiro, depois handle, e o nome
 *  normalizado só em último — é a regra 7 dita aqui: funde-se por prova, e um
 *  nome é a prova mais fraca que existe. */
export function importKeyOf(c: ImportedBrandCandidate): string {
  if (c.detectedDomain) return `domain:${c.detectedDomain}`;
  if (c.detectedInstagram) return `instagram:${c.detectedInstagram}`;
  if (c.detectedTiktok) return `tiktok:${c.detectedTiktok}`;
  if (c.detectedLinkedin) return `linkedin:${c.detectedLinkedin}`;
  return `name:${normalizeName(c.detectedName)}`;
}

/* ── Pistas de lugar ─────────────────────────────────────────────────────── */

/** O domínio nacional é prova fraca mas é prova: serve para orientar a
 *  pesquisa, nunca para afirmar a sede. Quem afirma o país é a pesquisa, com
 *  fonte. */
const TLD_COUNTRY: Record<string, string> = {
  pt: 'Portugal', br: 'Brasil', es: 'Espanha', fr: 'França', it: 'Itália',
  de: 'Alemanha', uk: 'Reino Unido', nl: 'Países Baixos', be: 'Bélgica',
  ch: 'Suíça', at: 'Áustria', ie: 'Irlanda', us: 'Estados Unidos',
};

/** Cidades que aparecem coladas ao nome quando ela separa marcas à mão
 *  («Torel Avantgarde - Porto»). Lista curta de propósito: uma pista errada
 *  manda a pesquisa para o sítio errado, e é melhor não ter pista nenhuma. */
const CITIES = [
  'lisboa', 'porto', 'braga', 'guimaraes', 'aveiro', 'coimbra', 'faro', 'algarve',
  'douro', 'madeira', 'funchal', 'acores', 'azores', 'cascais', 'sintra', 'evora',
  'setubal', 'viseu', 'leiria', 'obidos', 'comporta', 'gerês', 'geres',
  'sao paulo', 'rio de janeiro', 'belo horizonte', 'curitiba', 'florianopolis',
  'salvador', 'recife', 'fortaleza', 'brasilia', 'porto alegre',
];

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (v: string) => semAcento(v).toLowerCase().trim();

function cityFrom(tail: string): string | null {
  const t = chave(tail).replace(/[.,;]+$/, '');
  if (!t || t.length > 24) return null;
  return CITIES.includes(t) ? tail.trim().replace(/[.,;]+$/, '') : null;
}

/* ── De um pedaço de texto para um nome legível ──────────────────────────── */

const TITULO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the', 'of', 'and']);

/** `quinta-da-pacheca` e `quintadapacheca` não dão o mesmo resultado, e é
 *  suposto: o segundo não tem onde cortar. O nome legível serve para ela
 *  reconhecer a linha na pré-visualização — quem apura o nome oficial é a
 *  resolução de identidade, com prova. */
export function readableName(raw: string): string {
  const limpo = raw.replace(/[._\-+]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpo) return raw.trim();
  return limpo
    .split(' ')
    .map((p, i) =>
      i > 0 && TITULO.has(p.toLowerCase())
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(' ');
}

/* ── Parse ───────────────────────────────────────────────────────────────── */

const URL_RE = /^(https?:\/\/)?(www\.)?[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/\S*)?$/i;
/** Um domínio precisa de um sufixo alfabético com pelo menos duas letras, ou
 *  «Sr. 40» passava por site. */
const TEM_TLD = /\.[a-z]{2,}(\/|$|\?|#)/i;

const strip = (line: string) =>
  line
    // Marcadores de lista, numeração e aspas que vêm colados na cópia.
    .replace(/^\s*(?:[-*•·–—]|\d{1,3}[.)])\s+/, '')
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .trim();

/** Uma linha pode trazer o nome e mais alguma coisa: «Torel Avantgarde -
 *  Porto», «Quinta da Pacheca (Douro)». O que sobra vira pista de cidade
 *  quando é uma cidade conhecida, e é deitado fora quando não é — inventar
 *  «Lda» como cidade seria pior do que não saber. */
function splitTail(text: string): { head: string; cityHint: string | null } {
  const m = text.match(/^(.+?)\s*[-–—|(,]\s*([^()\-–—|,]+)\)?\s*$/);
  if (!m) return { head: text, cityHint: null };
  const city = cityFrom(m[2]);
  return city ? { head: m[1].trim(), cityHint: city } : { head: text, cityHint: null };
}

function fromUrl(raw: string): ImportedBrandCandidate | null {
  const texto = raw.trim();
  if (!URL_RE.test(texto) || !TEM_TLD.test(texto.endsWith('/') ? texto : `${texto}/`)) return null;

  const url = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const caminho = parsed.pathname.replace(/\/+$/, '');
  const tld = host.split('.').pop() ?? '';
  const base: Omit<ImportedBrandCandidate, 'inputType' | 'detectedName' | 'confidence'> = {
    rawInput: raw,
    normalizedInput: url,
    detectedDomain: null,
    detectedInstagram: null,
    detectedTiktok: null,
    detectedLinkedin: null,
    detectedWebsite: null,
    countryHint: TLD_COUNTRY[tld] ?? null,
    cityHint: null,
  };

  if (/(^|\.)instagram\.com$/.test(host)) {
    const handle = normalizeHandle(url);
    if (!handle) return null;
    return {
      ...base, countryHint: null, inputType: 'instagram', detectedInstagram: handle,
      detectedName: readableName(handle), confidence: 0.6,
    };
  }

  if (/(^|\.)tiktok\.com$/.test(host)) {
    const handle = normalizeHandle(url);
    if (!handle) return null;
    return {
      ...base, countryHint: null, inputType: 'tiktok', detectedTiktok: handle,
      detectedName: readableName(handle), confidence: 0.55,
    };
  }

  if (/(^|\.)linkedin\.com$/.test(host)) {
    const slug = caminho.match(/\/(?:company|school)\/([^/]+)/i)?.[1] ?? null;
    if (!slug) return null;
    return {
      ...base, countryHint: null, inputType: 'linkedin', detectedLinkedin: slug.toLowerCase(),
      detectedName: readableName(decodeURIComponent(slug)), confidence: 0.7,
    };
  }

  // Google Maps traz o nome no caminho quando é o link longo; o link curto
  // (`maps.app.goo.gl`) não traz nada e fica para a resolução de identidade.
  if (/(^|\.)google\.[a-z.]+$/.test(host) && /\/maps\//.test(caminho)) {
    const place = caminho.match(/\/maps\/place\/([^/]+)/)?.[1] ?? null;
    const nome = place ? readableName(decodeURIComponent(place).replace(/\+/g, ' ')) : '';
    return {
      ...base, countryHint: null, inputType: 'maps', detectedName: nome || raw.trim(),
      confidence: nome ? 0.7 : 0.3,
    };
  }
  if (/(^|\.)goo\.gl$/.test(host) || /(^|\.)maps\.app\.goo\.gl$/.test(host)) {
    return { ...base, countryHint: null, inputType: 'maps', detectedName: raw.trim(), confidence: 0.3 };
  }

  const domain = normalizeDomain(url);
  if (!domain) return null;
  const rotulo = domain.split('.')[0];
  return {
    ...base,
    inputType: caminho ? 'url' : 'domain',
    detectedDomain: domain,
    detectedWebsite: `${parsed.protocol}//${parsed.hostname}${caminho}`,
    detectedName: readableName(rotulo),
    confidence: 0.9,
  };
}

/** Vale a pena tentar partir esta linha por vírgulas?
 *
 *  «Six Senses, Quinta da Pacheca, Torel» é uma lista; «Hotel X, Rua das
 *  Flores 12, Porto» é uma morada. O que os separa é haver números e haver
 *  pedaços compridos — e na dúvida não se parte, porque juntar depois é
 *  impossível e ela vê logo na pré-visualização. */
function looksLikeList(line: string): boolean {
  if (/https?:|@|\.[a-z]{2,4}(\/|$)/i.test(line)) return false;
  const partes = line.split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length < 3) return false;
  return partes.every((p) => p.length <= 44 && p.split(/\s+/).length <= 5 && !/\d/.test(p));
}

export type ParsedList = {
  items: ImportedBrandCandidate[];
  /** Linhas que não deram marca nenhuma. Contam-se e mostram-se: dizer «10
   *  reconhecidas» sem dizer o que sobrou é esconder metade da resposta. */
  ignored: string[];
  /** Linhas diferentes que eram a mesma marca. */
  duplicates: number;
};

/** O texto colado, virado lista de entidades.
 *
 *  Não obriga a formato: aceita nome, domínio, URL, perfil, @ e uma mistura
 *  dos cinco. Uma linha por marca é o que a tela pede — dentro de uma linha,
 *  uma vírgula é «nome, cidade» e não um separador, exceto quando a linha
 *  inteira parece uma lista. */
export function parseBrandList(raw: string): ParsedList {
  const linhas = raw
    .split(/[\n\r\t;]+/)
    .flatMap((l) => (looksLikeList(l) ? l.split(',') : [l]))
    .map(strip)
    .filter(Boolean);

  const items: ImportedBrandCandidate[] = [];
  const ignored: string[] = [];
  const vistos = new Set<string>();
  let duplicates = 0;

  for (const linha of linhas) {
    // Uma linha sem letras não é uma marca: é um separador, um número solto
    // ou lixo da cópia.
    if (!/\p{L}/u.test(linha) || linha.length < 2) {
      if (linha.length >= 2) ignored.push(linha);
      continue;
    }

    const c = parseLine(linha);
    if (!c) {
      ignored.push(linha);
      continue;
    }

    const key = importKeyOf(c);
    if (vistos.has(key)) {
      duplicates++;
      continue;
    }
    vistos.add(key);
    items.push(c);
  }

  return { items, ignored, duplicates };
}

export function parseLine(raw: string): ImportedBrandCandidate | null {
  const texto = strip(raw);
  if (!texto) return null;

  const url = fromUrl(texto);
  if (url) return url;

  // @handle solto: é o Instagram, que é como ela guarda as marcas que vê.
  if (/^@[\w.]{2,}$/.test(texto)) {
    const handle = normalizeHandle(texto);
    if (!handle) return null;
    return {
      rawInput: raw, normalizedInput: `@${handle}`, inputType: 'instagram',
      detectedName: readableName(handle), detectedDomain: null, detectedInstagram: handle,
      detectedTiktok: null, detectedLinkedin: null, detectedWebsite: null,
      countryHint: null, cityHint: null, confidence: 0.6,
    };
  }

  // Um nome com um URL colado à frente: «Quinta da Pacheca https://…».
  const embutido = texto.match(/\S+\.[a-z]{2,}\S*/i);
  if (embutido && embutido[0].length < texto.length) {
    const parte = fromUrl(embutido[0]);
    if (parte) {
      const nome = strip(texto.replace(embutido[0], ''));
      const { head, cityHint } = splitTail(nome);
      return {
        ...parte,
        rawInput: raw,
        detectedName: head || parte.detectedName,
        cityHint,
        confidence: Math.min(0.95, parte.confidence + 0.05),
      };
    }
  }

  const { head, cityHint } = splitTail(texto);
  const nome = head.trim();
  if (!normalizeName(nome)) return null;

  return {
    rawInput: raw,
    normalizedInput: nome,
    inputType: 'name',
    detectedName: nome,
    detectedDomain: null,
    detectedInstagram: null,
    detectedTiktok: null,
    detectedLinkedin: null,
    detectedWebsite: null,
    countryHint: null,
    cityHint,
    // Um nome de duas palavras é procurável; uma palavra só pode ser meia
    // dúzia de empresas diferentes, e é a resolução de identidade que decide.
    confidence: nome.split(/\s+/).length >= 2 ? 0.75 : 0.5,
  };
}

/* ── Que relação já existe com esta marca ────────────────────────────────── */

export type Resolution =
  | 'NEW_COLD'
  | 'ALREADY_IN_CRM_NOT_CONTACTED'
  | 'ALREADY_CONTACTED'
  | 'WAITING_REPLY'
  | 'NURTURE'
  | 'REENGAGE'
  | 'ACTIVE_NEGOTIATION'
  | 'CLIENT'
  | 'SUPPRESSED'
  | 'IDENTITY_UNCERTAIN';

export type DedupEvidence = {
  /** A identidade foi provada por domínio, handle ou URL? Nome parecido não
   *  chega, e sem identidade não se classifica relação nenhuma. */
  identityCertain: boolean;
  /** Lista de não contatar, recusa explícita, unsubscribe. */
  suppressed: boolean;
  brandFound: boolean;
  /** A etapa da oportunidade aberta mais avançada, se houver. */
  opportunityStage: string | null;
  /** Já saiu uma abordagem daqui de dentro. */
  outreachSent: boolean;
  gmail: {
    checked: boolean;
    found: boolean;
    /** A marca chegou a responder alguma vez. */
    theyReplied: boolean;
    /** A última mensagem foi dela: estamos à espera deles. */
    waitingReply: boolean;
  };
};

export type Classified = { resolution: Resolution; note: string };

/** «Já falei com esta gente?» respondida antes de se gastar uma pesquisa de
 *  cold lead.
 *
 *  A ordem das perguntas é a ordem do risco. Não saber quem é a marca vem
 *  primeiro: classificar relação sobre uma identidade errada é pior do que não
 *  classificar. A supressão vem a seguir, porque é a única que proíbe. */
export function classifyResolution(e: DedupEvidence): Classified {
  if (!e.identityCertain) {
    return {
      resolution: 'IDENTITY_UNCERTAIN',
      note: 'Não consegui confirmar de que empresa se trata. Um nome parecido não chega.',
    };
  }

  if (e.suppressed) {
    return {
      resolution: 'SUPPRESSED',
      note: 'Esta marca está na lista de não contatar.',
    };
  }

  const stage = e.opportunityStage;
  if (stage === 'won') {
    return { resolution: 'CLIENT', note: 'Já é cliente. Aqui não se faz primeiro contato.' };
  }
  if (stage === 'negotiation' || stage === 'proposal' || stage === 'commercial_qualification' || stage === 'replied') {
    return {
      resolution: 'ACTIVE_NEGOTIATION',
      note: 'Há uma conversa comercial aberta. Uma abordagem nova por fora estraga a que já existe.',
    };
  }
  if (stage === 'nurture') {
    return { resolution: 'NURTURE', note: 'Ficou para mais tarde, por decisão de vocês dois.' };
  }
  if (stage === 'lost') {
    return { resolution: 'REENGAGE', note: 'Esta não avançou da última vez. Vale uma reabordagem, não um primeiro contato.' };
  }

  if (e.gmail.theyReplied) {
    return {
      resolution: 'ACTIVE_NEGOTIATION',
      note: 'Esta marca já respondeu num email anterior. A conversa existe fora do CarolOS.',
    };
  }
  if (e.gmail.waitingReply || (stage === 'outreach' && e.outreachSent)) {
    return {
      resolution: 'WAITING_REPLY',
      note: 'Já foi abordada e ainda não respondeu.',
    };
  }
  if (e.gmail.found || e.outreachSent) {
    return {
      resolution: 'ALREADY_CONTACTED',
      note: 'Já houve email com esta marca. Em vez de um primeiro contato, preparei uma reabordagem.',
    };
  }
  if (e.brandFound || stage) {
    return {
      resolution: 'ALREADY_IN_CRM_NOT_CONTACTED',
      note: 'Já estava no CRM mas nunca foi abordada.',
    };
  }

  return { resolution: 'NEW_COLD', note: 'Marca nova. Nunca houve conversa.' };
}

/** O que se escreve para esta marca, se é que se escreve alguma coisa. */
export type OutreachPlan = 'cold' | 'reengage' | 'none';

export function planFor(resolution: Resolution): OutreachPlan {
  switch (resolution) {
    case 'NEW_COLD':
    case 'ALREADY_IN_CRM_NOT_CONTACTED':
      return 'cold';
    case 'ALREADY_CONTACTED':
    case 'WAITING_REPLY':
    case 'NURTURE':
    case 'REENGAGE':
      return 'reengage';
    // Cliente, negociação aberta, supressão e identidade por confirmar não
    // levam email nenhum. Um email a mais aqui custa a relação que já existe.
    default:
      return 'none';
  }
}

/* ── O resumo que ela lê no fim ──────────────────────────────────────────── */

export type ImportBucket =
  | 'ready' | 'review' | 'already' | 'no_contact' | 'suppressed' | 'failed';

export type ImportItem = {
  status: string;
  resolution: string | null;
  contactEmail: string | null;
};

/** Uma marca cai num balde só. A ordem é a da conversa que ela ia ter comigo:
 *  primeiro o que falhou, depois o que não se aborda, depois o que está
 *  pronto. */
export function bucketOf(i: ImportItem): ImportBucket {
  if (i.status === 'failed') return 'failed';
  if (i.resolution === 'SUPPRESSED') return 'suppressed';
  if (
    i.resolution === 'ALREADY_CONTACTED' || i.resolution === 'WAITING_REPLY' ||
    i.resolution === 'NURTURE' || i.resolution === 'REENGAGE' ||
    i.resolution === 'ACTIVE_NEGOTIATION' || i.resolution === 'CLIENT'
  ) {
    return 'already';
  }
  if (i.status === 'ready' || i.status === 'approved' || i.status === 'edited' || i.status === 'sent') {
    return 'ready';
  }
  if (i.status === 'needs_review') return 'review';
  if (!i.contactEmail) return 'no_contact';
  return 'review';
}

export type ImportSummary = Record<ImportBucket, number> & { total: number };

export function summarize(items: readonly ImportItem[]): ImportSummary {
  const out: ImportSummary = {
    total: items.length, ready: 0, review: 0, already: 0, no_contact: 0, suppressed: 0, failed: 0,
  };
  for (const i of items) out[bucketOf(i)]++;
  return out;
}

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** A frase do fim. Só diz o que aconteceu — nada de «processamento concluído
 *  com sucesso», que não é informação nenhuma.
 *
 *  `duplicates` são linhas que se revelaram a mesma marca depois de a
 *  identidade ser conhecida. Não entram na contagem de marcas porque não são
 *  marcas — mas dizem-se, senão faltam duas em relação ao que ela colou. */
export function summaryText(s: ImportSummary, duplicates = 0): string {
  if (s.total === 0) return 'Não encontrei nenhuma marca nessa lista.';

  const partes = [
    s.ready ? `${plural(s.ready, 'pronta', 'prontas')} para abordagem` : '',
    s.already ? `${plural(s.already, 'já tinha', 'já tinham')} conversa` : '',
    s.no_contact ? `${plural(s.no_contact, 'sem contato', 'sem contato')} confiável` : '',
    s.review ? `${plural(s.review, 'para', 'para')} rever` : '',
    s.suppressed ? `${plural(s.suppressed, 'na lista', 'na lista')} de não contatar` : '',
    s.failed ? `${plural(s.failed, 'falhou', 'falharam')}` : '',
  ].filter(Boolean);

  const repetidas = duplicates
    ? ` ${plural(duplicates, 'linha era', 'linhas eram')} uma marca que já estava na lista.`
    : '';

  return `${plural(s.total, 'marca analisada', 'marcas analisadas')}: ${partes.join(', ')}.${repetidas}`;
}

/** «Pesquisando 6 de 10». Sem inventar percentagem: o que existe é uma
 *  contagem, e é essa que se mostra. */
export function progressText(processed: number, total: number): string {
  if (total === 0) return 'Pesquisando suas marcas';
  if (processed >= total) return 'Terminando';
  return `Pesquisando ${Math.max(1, processed + 1)} de ${total}`;
}

/* ── Rótulos de tela ─────────────────────────────────────────────────────── */

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  NEW_COLD: 'Marca nova',
  ALREADY_IN_CRM_NOT_CONTACTED: 'Já no CRM, nunca abordada',
  ALREADY_CONTACTED: 'Já abordada',
  WAITING_REPLY: 'À espera de resposta',
  NURTURE: 'Adiada para mais tarde',
  REENGAGE: 'Para reabordar',
  ACTIVE_NEGOTIATION: 'Conversa aberta',
  CLIENT: 'Cliente',
  SUPPRESSED: 'Não contatar',
  IDENTITY_UNCERTAIN: 'Identidade por confirmar',
};

export const isResolution = (v: string | null): v is Resolution =>
  v !== null && v in RESOLUTION_LABEL;
