import type { Field } from './schema';

export type DocKind = 'proposal' | 'contract';

export type DocRow = {
  id: string;
  kind: DocKind;
  title: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Block =
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'pair'; label: string; value: string };

export type Section = { title: string; blocks: Block[] };

export type Rendered = {
  heading: string;
  subheading: string;
  sections: Section[];
  signature: string[];
};

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const lines = (v: unknown) =>
  s(v)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const dataPt = (v: unknown) => {
  const raw = s(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
};

const ou = (v: unknown, fallback: string) => s(v) || fallback;

/* ─────────────────────────────  Proposta  ───────────────────────────── */

export const PROPOSAL_BLANK = {
  brand: '',
  contactName: '',
  contactEmail: '',
  date: '',
  validDays: '15',
  packageName: '',
  summary: '',
  deliverables: '',
  price: '',
  priceSuffix: '',
  payment: '50% na adjudicação e 50% na entrega final.',
  deliveryDays: '7',
  revisions: '1 revisão por vídeo, sobre a primeira versão.',
  usage: 'Uso orgânico nas redes da marca, sem limite de tempo.',
  ads: 'Direitos para anúncios pagos não incluídos. Extra de 75€ por vídeo, válidos por 6 meses.',
  notes: '',
};

export const PROPOSAL_FIELDS: Field[] = [
  { k: 'text', path: 'brand', label: 'Marca' },
  { k: 'text', path: 'contactName', label: 'Pessoa de contacto' },
  { k: 'text', path: 'contactEmail', label: 'E-mail de contacto' },
  { k: 'text', path: 'date', label: 'Data da proposta', hint: 'No formato AAAA-MM-DD.' },
  { k: 'text', path: 'validDays', label: 'Validade em dias' },
  { k: 'text', path: 'packageName', label: 'Nome do pacote' },
  { k: 'area', path: 'summary', label: 'O que proponho' },
  {
    k: 'area',
    path: 'deliverables',
    label: 'Entregáveis',
    hint: 'Um por linha.',
  },
  { k: 'text', path: 'price', label: 'Valor em euros' },
  { k: 'text', path: 'priceSuffix', label: 'Sufixo do valor', hint: 'Por exemplo /mês. Deixa vazio se for valor único.' },
  { k: 'area', path: 'payment', label: 'Condições de pagamento' },
  { k: 'text', path: 'deliveryDays', label: 'Prazo de entrega em dias úteis' },
  { k: 'area', path: 'revisions', label: 'Revisões' },
  { k: 'area', path: 'usage', label: 'Direitos de uso' },
  { k: 'area', path: 'ads', label: 'Anúncios pagos' },
  { k: 'area', path: 'notes', label: 'Observações' },
];

function proposal(d: Record<string, unknown>, author: Author): Rendered {
  const valor = s(d.price)
    ? `${s(d.price)}€${s(d.priceSuffix)}`
    : 'A definir';

  return {
    heading: 'Proposta de criação de conteúdo',
    subheading: [
      ou(d.brand, 'Marca por preencher'),
      s(d.date) ? dataPt(d.date) : '',
    ]
      .filter(Boolean)
      .join(' · '),
    sections: [
      {
        title: 'Partes',
        blocks: [
          { t: 'pair', label: 'Para', value: [ou(d.brand, '—'), s(d.contactName), s(d.contactEmail)].filter(Boolean).join(' · ') },
          { t: 'pair', label: 'De', value: [author.name, author.role, author.contact].filter(Boolean).join(' · ') },
          ...(s(d.validDays)
            ? [{ t: 'pair' as const, label: 'Validade', value: `${s(d.validDays)} dias a contar da data acima` }]
            : []),
        ],
      },
      {
        title: 'O que proponho',
        blocks: [
          ...(s(d.packageName) ? [{ t: 'pair' as const, label: 'Pacote', value: s(d.packageName) }] : []),
          ...(s(d.summary) ? [{ t: 'p' as const, text: s(d.summary) }] : []),
          ...(lines(d.deliverables).length
            ? [{ t: 'list' as const, items: lines(d.deliverables) }]
            : []),
        ],
      },
      {
        title: 'Prazos',
        blocks: [
          {
            t: 'p',
            text: `Entrega em ${ou(d.deliveryDays, '7')} dias úteis a contar da chegada do produto e da validação do conceito.`,
          },
        ],
      },
      {
        title: 'Investimento',
        blocks: [
          { t: 'pair', label: 'Valor', value: valor },
          ...(s(d.payment) ? [{ t: 'p' as const, text: s(d.payment) }] : []),
        ],
      },
      {
        title: 'Revisões',
        blocks: [{ t: 'p', text: ou(d.revisions, '—') }],
      },
      {
        title: 'Direitos de uso',
        blocks: [
          { t: 'p', text: ou(d.usage, '—') },
          ...(s(d.ads) ? [{ t: 'p' as const, text: s(d.ads) }] : []),
        ],
      },
      ...(s(d.notes)
        ? [{ title: 'Observações', blocks: [{ t: 'p' as const, text: s(d.notes) }] }]
        : []),
      {
        title: 'Como avançar',
        blocks: [
          {
            t: 'p',
            text: 'Para aceitar, basta responder a esta proposta por escrito. A partir daí combinamos o envio do produto e a data de gravação.',
          },
        ],
      },
    ],
    signature: [],
  };
}

/* ─────────────────────────────  Contrato  ───────────────────────────── */

export const CONTRACT_BLANK = {
  creatorName: '',
  creatorNif: '',
  creatorAddress: '',
  clientName: '',
  clientNif: '',
  clientAddress: '',
  clientRep: '',
  date: '',
  object: '',
  deliverables: '',
  deliveryDays: '7',
  price: '',
  payment: '50% na assinatura e 50% na entrega final, a 15 dias após fatura.',
  usageScope: 'Redes sociais próprias da marca, em publicações orgânicas.',
  usageTerritory: 'Portugal',
  usageDuration: '12 meses a contar da entrega',
  revisions: 'Uma rodada de comentários sobre a primeira versão de cada vídeo. Revisões adicionais são orçamentadas à parte.',
  clientDuties: 'Enviar o produto e a informação necessária.\nResponder a pedidos de validação em 3 dias úteis.',
  cancellation: 'Se a marca cancelar depois do início da gravação, o valor pago não é devolvido. Se cancelar antes, é devolvido na totalidade.',
  confidentiality: 'Ambas as partes mantêm confidencial a informação não pública a que tenham acesso.',
  law: 'portuguesa',
  forum: 'Comarca de Lisboa',
  place: 'Lisboa',
};

export const CONTRACT_FIELDS: Field[] = [
  { k: 'text', path: 'creatorName', label: 'Nome da criadora' },
  { k: 'text', path: 'creatorNif', label: 'NIF da criadora' },
  { k: 'text', path: 'creatorAddress', label: 'Morada da criadora' },
  { k: 'text', path: 'clientName', label: 'Nome ou empresa do cliente' },
  { k: 'text', path: 'clientNif', label: 'NIF do cliente' },
  { k: 'text', path: 'clientAddress', label: 'Morada do cliente' },
  { k: 'text', path: 'clientRep', label: 'Representante do cliente' },
  { k: 'text', path: 'date', label: 'Data', hint: 'No formato AAAA-MM-DD.' },
  { k: 'text', path: 'place', label: 'Local' },
  { k: 'area', path: 'object', label: 'Objeto do contrato' },
  { k: 'area', path: 'deliverables', label: 'Entregáveis', hint: 'Um por linha.' },
  { k: 'text', path: 'deliveryDays', label: 'Prazo de entrega em dias úteis' },
  { k: 'text', path: 'price', label: 'Valor em euros' },
  { k: 'area', path: 'payment', label: 'Pagamento' },
  { k: 'area', path: 'usageScope', label: 'Direitos · âmbito' },
  { k: 'text', path: 'usageTerritory', label: 'Direitos · território' },
  { k: 'text', path: 'usageDuration', label: 'Direitos · duração' },
  { k: 'area', path: 'revisions', label: 'Revisões' },
  { k: 'area', path: 'clientDuties', label: 'Obrigações do cliente', hint: 'Uma por linha.' },
  { k: 'area', path: 'cancellation', label: 'Cancelamento' },
  { k: 'area', path: 'confidentiality', label: 'Confidencialidade' },
  { k: 'text', path: 'law', label: 'Lei aplicável' },
  { k: 'text', path: 'forum', label: 'Foro' },
];

function contract(d: Record<string, unknown>, author: Author): Rendered {
  const parte = (nome: string, nif: string, morada: string, rep: string) =>
    [nome, nif ? `NIF ${nif}` : '', morada, rep ? `representada por ${rep}` : '']
      .filter(Boolean)
      .join(', ');

  return {
    heading: 'Contrato de prestação de serviços de criação de conteúdo',
    subheading: [ou(d.clientName, 'Cliente por preencher'), s(d.date) ? dataPt(d.date) : '']
      .filter(Boolean)
      .join(' · '),
    sections: [
      {
        title: 'Entre',
        blocks: [
          {
            t: 'pair',
            label: 'Primeira contraente',
            value: parte(ou(d.creatorName, author.name), s(d.creatorNif), s(d.creatorAddress), ''),
          },
          {
            t: 'pair',
            label: 'Segunda contraente',
            value: parte(ou(d.clientName, '—'), s(d.clientNif), s(d.clientAddress), s(d.clientRep)),
          },
          {
            t: 'p',
            text: 'As partes acordam entre si o presente contrato, nos termos das cláusulas seguintes.',
          },
        ],
      },
      {
        title: 'Primeira · Objeto',
        blocks: [
          { t: 'p', text: ou(d.object, 'A primeira contraente cria conteúdo audiovisual para a segunda contraente, nos termos descritos abaixo.') },
          ...(lines(d.deliverables).length
            ? [{ t: 'list' as const, items: lines(d.deliverables) }]
            : []),
        ],
      },
      {
        title: 'Segunda · Prazo de entrega',
        blocks: [
          {
            t: 'p',
            text: `A entrega é feita em ${ou(d.deliveryDays, '7')} dias úteis a contar da receção do produto e da validação do conceito pela segunda contraente.`,
          },
        ],
      },
      {
        title: 'Terceira · Preço e pagamento',
        blocks: [
          { t: 'pair', label: 'Valor', value: s(d.price) ? `${s(d.price)}€` : 'A definir' },
          { t: 'p', text: ou(d.payment, '—') },
        ],
      },
      {
        title: 'Quarta · Direitos de utilização',
        blocks: [
          { t: 'p', text: ou(d.usageScope, '—') },
          { t: 'pair', label: 'Território', value: ou(d.usageTerritory, '—') },
          { t: 'pair', label: 'Duração', value: ou(d.usageDuration, '—') },
          {
            t: 'p',
            text: 'Qualquer utilização fora do âmbito, território ou duração acima carece de acordo escrito prévio e é orçamentada à parte. A primeira contraente mantém o direito de mostrar o trabalho no seu portfólio.',
          },
        ],
      },
      {
        title: 'Quinta · Revisões',
        blocks: [{ t: 'p', text: ou(d.revisions, '—') }],
      },
      {
        title: 'Sexta · Obrigações da segunda contraente',
        blocks: lines(d.clientDuties).length
          ? [{ t: 'list', items: lines(d.clientDuties) }]
          : [{ t: 'p', text: '—' }],
      },
      {
        title: 'Sétima · Cancelamento',
        blocks: [{ t: 'p', text: ou(d.cancellation, '—') }],
      },
      {
        title: 'Oitava · Confidencialidade',
        blocks: [{ t: 'p', text: ou(d.confidentiality, '—') }],
      },
      {
        title: 'Nona · Lei aplicável e foro',
        blocks: [
          {
            t: 'p',
            text: `O contrato rege-se pela lei ${ou(d.law, 'portuguesa')}. Para dirimir qualquer litígio, as partes elegem o foro da ${ou(d.forum, '—')}, com renúncia a qualquer outro.`,
          },
        ],
      },
    ],
    signature: [
      `${ou(d.place, '—')}, ${s(d.date) ? dataPt(d.date) : '___ / ___ / ______'}`,
      ou(d.creatorName, author.name),
      ou(d.clientName, '—'),
    ],
  };
}

/* ────────────────────────────────────────────────────────────────────── */

export type Author = { name: string; role: string; contact: string };

export const DOCS: Record<
  DocKind,
  {
    label: string;
    one: string;
    novo: string;
    vazio: string;
    blank: Record<string, unknown>;
    fields: Field[];
    titleOf: (d: Record<string, unknown>) => string;
    render: (d: Record<string, unknown>, author: Author) => Rendered;
  }
> = {
  proposal: {
    label: 'Propostas',
    one: 'Proposta',
    novo: 'Proposta nova',
    vazio: 'Ainda não há propostas. Cria a primeira e só tens de preencher os dados — o documento sai montado.',
    blank: PROPOSAL_BLANK,
    fields: PROPOSAL_FIELDS,
    titleOf: (d) => s(d.brand) || 'Proposta sem marca',
    render: proposal,
  },
  contract: {
    label: 'Contratos',
    one: 'Contrato',
    novo: 'Contrato novo',
    vazio: 'Ainda não há contratos. Cria o primeiro e só tens de preencher os dados — o documento sai montado.',
    blank: CONTRACT_BLANK,
    fields: CONTRACT_FIELDS,
    titleOf: (d) => s(d.clientName) || 'Contrato sem cliente',
    render: contract,
  },
};
