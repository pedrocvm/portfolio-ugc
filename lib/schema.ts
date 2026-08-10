/** Descrição dos campos editáveis. O layout não entra aqui: a área privada só
 *  conhece valores, e cada um sabe onde vive dentro do modelo de conteúdo. */

export type Field =
  | { k: 'text'; path: string; label: string; hint?: string }
  | { k: 'area'; path: string; label: string; hint?: string }
  | { k: 'bool'; path: string; label: string; hint?: string }
  | { k: 'image'; path: string; label: string; hint?: string }
  | { k: 'video'; path: string; label: string; hint?: string }
  | { k: 'media'; path: string; label: string; hint?: string }
  | { k: 'strings'; path: string; label: string; hint?: string; fixed?: boolean }
  | {
      k: 'list';
      path: string;
      label: string;
      hint?: string;
      title: string;
      item: Field[];
      blank: unknown;
    };

export type Section = { id: string; title: string; note: string; fields: Field[] };

const heading = (base: string, what: string): Field[] => [
  { k: 'text', path: `${base}.titleLead`, label: `Título de ${what}` },
  {
    k: 'text',
    path: `${base}.titleEm`,
    label: 'Remate do título',
    hint: 'Sai no tipo de letra manuscrito, a fechar a frase.',
  },
];

const chapter = (base: string, what: string): Field[] => [
  { k: 'text', path: `${base}.num`, label: 'Número do capítulo' },
  { k: 'text', path: `${base}.eyebrow`, label: 'Etiqueta' },
  ...heading(base, what),
];

export const SECTIONS: Section[] = [
  {
    id: 'hero',
    title: 'Abertura',
    note: 'O primeiro ecrã, com o vídeo de fundo e o teu nome.',
    fields: [
      { k: 'text', path: 'hero.top', label: 'Canto superior' },
      { k: 'text', path: 'hero.kicker', label: 'Linha acima do nome' },
      { k: 'text', path: 'hero.firstName', label: 'Primeiro nome' },
      { k: 'text', path: 'hero.lastName', label: 'Apelido' },
      { k: 'text', path: 'hero.scroll', label: 'Indicação para rolar' },
      {
        k: 'image',
        path: 'hero.imageWide',
        label: 'Imagem de fundo · computador',
      },
      {
        k: 'image',
        path: 'hero.imagePortrait',
        label: 'Imagem de fundo · telemóvel',
      },
      { k: 'video', path: 'hero.video', label: 'Vídeo de fundo' },
    ],
  },
  {
    id: 'meet',
    title: 'Sobre ti',
    note: 'A apresentação, os nichos e a nota pessoal.',
    fields: [
      { k: 'text', path: 'meet.eyebrow', label: 'Etiqueta' },
      ...heading('meet', 'apresentação'),
      { k: 'area', path: 'meet.bio', label: 'Texto de apresentação' },
      { k: 'area', path: 'meet.note', label: 'Nota pessoal' },
      {
        k: 'list',
        path: 'meet.niches',
        label: 'Nichos',
        title: 'Nicho',
        hint: 'Cada nicho abre a gaveta com os registos. Os registos saem da Biblioteca.',
        blank: { name: '', reel: [] },
        item: [
          { k: 'text', path: 'name', label: 'Nome do nicho' },
          {
            k: 'list',
            path: 'reel',
            label: 'Registos deste nicho',
            title: 'Registo',
            hint: 'Sem registos, a gaveta mostra uma seleção automática das fotos do site.',
            blank: { src: '' },
            item: [{ k: 'media', path: 'src', label: 'Ficheiro' }],
          },
        ],
      },
      { k: 'image', path: 'meet.imageMain', label: 'Retrato principal' },
      {
        k: 'text',
        path: 'meet.imageMainAlt',
        label: 'Descrição do retrato',
        hint: 'Lida por leitores de ecrã e por motores de busca.',
      },
      { k: 'text', path: 'meet.shelfEyebrow', label: 'Etiqueta da gaveta' },
      { k: 'text', path: 'meet.shelfFoot', label: 'Rodapé da gaveta' },
    ],
  },
  {
    id: 'session',
    title: 'A sessão',
    note: 'As tomadas que passam enquanto se rola a página.',
    fields: [
      { k: 'text', path: 'session.label', label: 'Etiqueta' },
      {
        k: 'list',
        path: 'session.takes',
        label: 'Vídeos em destaque',
        title: 'Vídeo',
        hint: 'São sempre seis, e cada um tem a sua legenda própria.',
        blank: { label: '', n: '', niche: '', img: '' },
        item: [
          {
            k: 'text',
            path: 'label',
            label: 'Legenda deste vídeo',
            hint: 'Escreve o que quiseres. Aparece antes do nicho.',
          },
          {
            k: 'text',
            path: 'n',
            label: 'Número',
            hint: 'Sai em grande ao lado e no contador.',
          },
          { k: 'text', path: 'niche', label: 'Nicho' },
          {
            k: 'media',
            path: 'img',
            label: 'Vídeo ou imagem',
            hint: 'Um vídeo passa em contínuo enquanto a tomada está à vista.',
          },
        ],
      },
    ],
  },
  {
    id: 'formats',
    title: 'Formatos',
    note: 'O que gravas, sobre o vídeo de fundo.',
    fields: [
      ...chapter('formats', 'formatos'),
      {
        k: 'list',
        path: 'formats.items',
        label: 'Formatos',
        title: 'Formato',
        blank: { name: '', note: '' },
        item: [
          { k: 'text', path: 'name', label: 'Nome' },
          { k: 'text', path: 'note', label: 'Nota', hint: 'Deixa vazio para não mostrar.' },
        ],
      },
      { k: 'image', path: 'formats.image', label: 'Imagem de fundo · computador' },
      { k: 'image', path: 'formats.imageSm', label: 'Imagem de fundo · telemóvel' },
      { k: 'video', path: 'formats.video', label: 'Vídeo de fundo' },
    ],
  },
  {
    id: 'photos',
    title: 'Fotos UGC',
    note: 'O carrossel de fotografias.',
    fields: [
      ...chapter('photos', 'fotos'),
      {
        k: 'list',
        path: 'photos.items',
        label: 'Fotografias',
        title: 'Foto',
        blank: { src: '', alt: '' },
        item: [
          { k: 'image', path: 'src', label: 'Fotografia' },
          { k: 'text', path: 'alt', label: 'Descrição', hint: 'Opcional.' },
        ],
      },
      { k: 'text', path: 'photos.footLeft', label: 'Rodapé · esquerda' },
      { k: 'text', path: 'photos.footRight', label: 'Rodapé · direita' },
    ],
  },
  {
    id: 'process',
    title: 'Processo',
    note: 'Os passos, do primeiro contacto à entrega.',
    fields: [
      ...chapter('process', 'processo'),
      {
        k: 'list',
        path: 'process.steps',
        label: 'Passos',
        title: 'Passo',
        blank: { n: '', title: '', text: '' },
        item: [
          { k: 'text', path: 'n', label: 'Número' },
          { k: 'text', path: 'title', label: 'Título' },
          {
            k: 'area',
            path: 'text',
            label: 'Descrição',
            hint: 'Sai por baixo do título, em letra mais leve.',
          },
        ],
      },
    ],
  },
  {
    id: 'plans',
    title: 'Pacotes',
    note: 'Preços, o que está incluído e os extras.',
    fields: [
      ...chapter('plans', 'pacotes'),
      {
        k: 'bool',
        path: 'plans.showPrices',
        label: 'Mostrar os preços no site',
        hint: 'Desligado, os pacotes e os add-ons aparecem sem valores. Os preços continuam guardados aqui para quando quiseres voltar a mostrá-los.',
      },
      {
        k: 'list',
        path: 'plans.items',
        label: 'Pacotes',
        title: 'Pacote',
        blank: {
          name: '',
          best: false,
          price: '',
          suffix: '',
          qty: '',
          unit: '',
          feat: [''],
        },
        item: [
          { k: 'text', path: 'name', label: 'Nome' },
          { k: 'bool', path: 'best', label: 'Marcar como recomendado' },
          { k: 'text', path: 'qty', label: 'Quantidade' },
          { k: 'text', path: 'price', label: 'Preço' },
          {
            k: 'text',
            path: 'suffix',
            label: 'Sufixo do preço',
            hint: 'Sai a seguir ao valor. No pacote mensal, "/mês".',
          },
          { k: 'text', path: 'unit', label: 'Preço por vídeo' },
          { k: 'strings', path: 'feat', label: 'O que inclui' },
        ],
      },
      { k: 'text', path: 'plans.includedTitle', label: 'Título do incluído' },
      { k: 'area', path: 'plans.includedText', label: 'Texto do incluído' },
      { k: 'text', path: 'plans.addonsTitle', label: 'Título dos extras' },
      {
        k: 'list',
        path: 'plans.addons',
        label: 'Extras',
        title: 'Extra',
        blank: { label: '', value: '' },
        item: [
          { k: 'text', path: 'label', label: 'Nome' },
          { k: 'text', path: 'value', label: 'Valor' },
        ],
      },
      { k: 'text', path: 'plans.note', label: 'Nota final' },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    note: 'As perguntas frequentes.',
    fields: [
      ...chapter('faq', 'perguntas'),
      {
        k: 'list',
        path: 'faq.items',
        label: 'Perguntas',
        title: 'Pergunta',
        blank: { q: '', a: '' },
        item: [
          { k: 'text', path: 'q', label: 'Pergunta' },
          { k: 'area', path: 'a', label: 'Resposta' },
        ],
      },
    ],
  },
  {
    id: 'footer',
    title: 'Rodapé',
    note: 'O fecho da página e o convite para falar contigo.',
    fields: [
      { k: 'text', path: 'footer.eyebrow', label: 'Etiqueta' },
      ...heading('footer', 'fecho'),
      { k: 'area', path: 'footer.lead', label: 'Texto' },
      { k: 'text', path: 'footer.cta', label: 'Botão' },
      { k: 'text', path: 'footer.igPrefix', label: 'Frase antes do Instagram' },
      { k: 'image', path: 'footer.image', label: 'Retrato' },
      { k: 'text', path: 'footer.imageAlt', label: 'Descrição do retrato' },
      { k: 'video', path: 'footer.video', label: 'Vídeo do retrato' },
      { k: 'text', path: 'footer.caption', label: 'Legenda' },
      { k: 'text', path: 'footer.captionSub', label: 'Legenda · segunda linha' },
      { k: 'text', path: 'footer.barLeft', label: 'Barra final · esquerda' },
      { k: 'text', path: 'footer.barRight', label: 'Barra final · direita' },
    ],
  },
  {
    id: 'nav',
    title: 'Cabeçalho',
    note: 'A barra que aparece ao rolar a página.',
    fields: [
      { k: 'text', path: 'nav.brand', label: 'Nome na barra' },
      { k: 'text', path: 'nav.cta', label: 'Botão da barra' },
      { k: 'text', path: 'nav.chip', label: 'Botão flutuante' },
      {
        k: 'strings',
        path: 'nav.labels',
        label: 'Nomes das secções',
        hint: 'Pela ordem: sobre, formatos, fotos, processo, pacotes e FAQ. Mudam o nome, não a ordem nem o destino.',
        fixed: true,
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contactos',
    note: 'Para onde vão os botões de contacto.',
    fields: [
      {
        k: 'text',
        path: 'contact.phone',
        label: 'Telemóvel para WhatsApp',
        hint: 'Só dígitos, com o indicativo do país. Exemplo: 351912345678.',
      },
      {
        k: 'area',
        path: 'contact.whatsappMessage',
        label: 'Mensagem já escrita no WhatsApp',
      },
      { k: 'text', path: 'contact.instagram', label: 'Ligação do Instagram' },
      { k: 'text', path: 'contact.instagramHandle', label: 'Nome no Instagram' },
    ],
  },
  {
    id: 'meta',
    title: 'Google e redes',
    note: 'O que aparece nos resultados de pesquisa e ao partilhar a ligação.',
    fields: [
      { k: 'text', path: 'meta.title', label: 'Título da página' },
      { k: 'area', path: 'meta.description', label: 'Descrição da página' },
      { k: 'text', path: 'meta.ogTitle', label: 'Título ao partilhar' },
      { k: 'area', path: 'meta.ogDescription', label: 'Descrição ao partilhar' },
      { k: 'image', path: 'meta.ogImage', label: 'Imagem ao partilhar' },
    ],
  },
];
