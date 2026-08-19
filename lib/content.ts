/** Modelo de conteúdo do site. O layout das secções é fixo: a área privada só
 *  altera os valores deste objeto, nunca a estrutura. */

export type Video = { src: string; srcSm: string };
export type Take = { label: string; n: string; niche: string; img: string };
export type Photo = { src: string; alt: string };
export type Niche = { name: string; reel: { src: string }[] };
export type Step = { n: string; title: string; text: string };
export type FaqItem = { q: string; a: string };
export type Addon = { label: string; value: string };
export type LinkItem = { label: string; note: string; href: string; image: string };
export type Plan = {
  name: string;
  best: boolean;
  price: string;
  suffix: string;
  qty: string;
  unit: string;
  feat: string[];
};

export type Content = {
  meta: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
  };
  contact: {
    phone: string;
    whatsappMessage: string;
    instagram: string;
    instagramHandle: string;
  };
  nav: { brand: string; cta: string; labels: string[]; chip: string };
  hero: {
    top: string;
    kicker: string;
    firstName: string;
    lastName: string;
    scroll: string;
    imageWide: string;
    imagePortrait: string;
    video: Video;
  };
  meet: {
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    bio: string;
    note: string;
    niches: Niche[];
    imageMain: string;
    imageMainAlt: string;
    imageSub: string;
    shelfEyebrow: string;
    shelfFoot: string;
  };
  session: { label: string; takes: Take[] };
  photos: {
    num: string;
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    items: Photo[];
    footLeft: string;
    footRight: string;
  };
  process: {
    num: string;
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    steps: Step[];
  };
  plans: {
    num: string;
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    showPrices: boolean;
    items: Plan[];
    includedTitle: string;
    includedText: string;
    addonsTitle: string;
    addons: Addon[];
    note: string;
  };
  faq: {
    num: string;
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    items: FaqItem[];
  };
  footer: {
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    lead: string;
    cta: string;
    igPrefix: string;
    image: string;
    imageAlt: string;
    video: Video;
    barLeft: string;
    barRight: string;
  };
  links: {
    avatar: string;
    avatarAlt: string;
    items: LinkItem[];
  };
};

/** Os âncoras das secções são estrutura, não conteúdo: ficam fora do modelo. */
export const NAV_HREFS = [
  '#meet',
  '#fotos',
  '#processo',
  '#pacotes',
  '#faq',
] as const;

export const DEFAULT_CONTENT: Content = {
  meta: {
    title: 'Carol Queiroz — UGC Creator · Sessão privada',
    description:
      'Vídeos UGC em português para marcas de casa e decor, cabelo, skincare, tecnologia e serviços. A partir de 150€.',
    ogTitle: 'Carol Queiroz — UGC Creator',
    ogDescription:
      'Vídeos UGC em português para marcas. A partir de 150€, entrega em 7 dias úteis.',
    ogImage: '/img/img-01.jpg',
  },
  contact: {
    phone: '351913896987',
    whatsappMessage:
      'Olá Carol, vi o teu portfólio e gostaria de saber mais sobre o teu trabalho.',
    instagram: 'https://instagram.com/carolxqueiroz',
    instagramHandle: '@carolxqueiroz',
  },
  nav: {
    brand: 'Carol Queiroz',
    cta: 'Pedir vídeo',
    labels: ['Sobre', 'Fotos', 'Processo', 'Pacotes', 'FAQ'],
    chip: 'Pedir vídeo →',
  },
  hero: {
    top: 'Portfólio · 2026',
    kicker: 'UGC Creator · Portugal',
    firstName: 'Carolina',
    lastName: 'Queiroz',
    scroll: 'Rolar',
    imageWide: '/img/img-01.jpg',
    imagePortrait: '/img/img-02.jpg',
    video: { src: '/videos/hero-loop.mp4', srcSm: '/videos/hero-loop-sm.mp4' },
  },
  meet: {
    eyebrow: 'Antes da sessão',
    titleLead: 'Prazer,',
    titleEm: 'Carol.',
    bio: 'Falo para a câmera como falo com quem conheço. Gravo, escrevo e edito os meus próprios vídeos, em português, para marcas que querem ver o produto na vida real antes de o vender.',
    note: '“No vídeo do sérum decidi abrir com a textura no dorso da mão, porque é o que eu verificaria antes de comprar.”',
    niches: [
      { name: 'Casa & Decor', reel: [] },
      { name: 'Cabelo', reel: [] },
      { name: 'Tech', reel: [] },
      { name: 'Skincare', reel: [] },
      { name: 'Serviços', reel: [] },
    ],
    imageMain: '/img/img-03.jpg',
    imageMainAlt: 'Retrato de Carol Queiroz',
    imageSub: '/img/img-04.jpg',
    shelfEyebrow: 'Nicho',
    shelfFoot: '',
  },
  session: {
    label: 'A sessão',
    takes: [
      { label: 'Tomada 01', n: '01', niche: 'Casa & Decor', img: '/img/img-15.jpg' },
      { label: 'Tomada 02', n: '02', niche: 'Casa & Decor', img: '/img/img-16.jpg' },
      { label: 'Tomada 03', n: '03', niche: 'Cabelo', img: '/img/img-17.jpg' },
      { label: 'Tomada 04', n: '04', niche: 'Tech', img: '/img/img-18.jpg' },
      { label: 'Tomada 05', n: '05', niche: 'Skincare', img: '/img/img-19.jpg' },
      { label: 'Tomada 06', n: '06', niche: 'Serviços', img: '/img/img-20.jpg' },
    ],
  },
  photos: {
    num: '01',
    eyebrow: 'Registos',
    titleLead: 'Fotos',
    titleEm: 'UGC.',
    items: [
      { src: '/img/img-06.jpg', alt: '' },
      { src: '/img/img-07.jpg', alt: '' },
      { src: '/img/img-08.jpg', alt: '' },
      { src: '/img/img-09.jpg', alt: '' },
      { src: '/img/img-10.jpg', alt: '' },
      { src: '/img/img-11.jpg', alt: '' },
      { src: '/img/img-12.jpg', alt: '' },
    ],
    footLeft: '',
    footRight: '',
  },
  process: {
    num: '02',
    eyebrow: 'Processo',
    titleLead: 'Como',
    titleEm: 'funciona.',
    steps: [
      {
        n: '01',
        title: 'Briefing',
        text: 'Contas-me o produto, o objetivo e onde vai o vídeo.',
      },
      {
        n: '02',
        title: 'Proposta',
        text: 'Proponho o formato, a abordagem e o que preciso de receber.',
      },
      { n: '03', title: 'Conceito', text: 'Validamos o conceito antes de gravar.' },
      {
        n: '04',
        title: 'Gravação',
        text: 'Gravo e edito, e envias comentários sobre a primeira versão.',
      },
      {
        n: '05',
        title: 'Entrega',
        text: 'Entrego o ficheiro final no formato combinado.',
      },
    ],
  },
  plans: {
    num: '03',
    showPrices: false,
    eyebrow: 'Pacotes',
    titleLead: 'Quanto',
    titleEm: 'custa.',
    items: [
      {
        name: 'Tester',
        best: false,
        price: '150',
        suffix: '',
        qty: '1 vídeo',
        unit: '150€ por vídeo',
        feat: [
          '1 formato à escolha',
          'Roteiro, gravação e edição',
          'Legendas incluídas',
          '1 revisão',
          'Uso orgânico',
          'Entrega em 7 dias úteis',
        ],
      },
      {
        name: 'Essential',
        best: true,
        price: '405',
        suffix: '',
        qty: '3 vídeos',
        unit: '135€ por vídeo',
        feat: [
          'Formatos à escolha',
          'Roteiro, gravação e edição',
          'Legendas incluídas',
          '2 aberturas alternativas para testar',
          '1 revisão por vídeo',
          'Uso orgânico',
          'Entrega em 7 dias úteis',
        ],
      },
      {
        name: 'Premium',
        best: false,
        price: '625',
        suffix: '',
        qty: '5 vídeos',
        unit: '125€ por vídeo',
        feat: [
          'Formatos à escolha',
          'Roteiro, gravação e edição',
          'Legendas incluídas',
          '4 aberturas alternativas para testar',
          '2 revisões por vídeo',
          'Direitos para Ads · 6 meses incluídos',
          'Prioridade de agenda',
          'Entrega em 7 dias úteis',
        ],
      },
      {
        name: 'Mensal',
        best: false,
        price: '500',
        suffix: '/mês',
        qty: '4 vídeos por mês',
        unit: '125€ por vídeo',
        feat: [
          'Formatos à escolha',
          'Roteiro, gravação e edição',
          'Legendas incluídas',
          '1 revisão por vídeo',
          'Uso orgânico',
          'Conteúdo novo todos os meses',
        ],
      },
    ],
    includedTitle: 'Incluído em todos',
    includedText:
      'Roteiro meu, gravação, edição, legendas, revisão e uso orgânico. Entrega em 7 dias úteis depois de o produto chegar.',
    addonsTitle: 'Add-ons',
    addons: [
      { label: 'Direitos para Ads · 6 meses', value: '+75€' },
      { label: 'Abertura extra', value: '25€' },
      { label: 'Revisão extra', value: '25€' },
    ],
    note: 'Valores de lançamento',
  },
  faq: {
    num: '04',
    eyebrow: 'FAQ',
    titleLead: 'Antes de',
    titleEm: 'perguntares.',
    items: [
      {
        q: 'Tenho de trazer guião?',
        a: 'Não. Diz-me o produto e para onde vai o vídeo, e eu proponho a abordagem.',
      },
      {
        q: 'Quanto tempo demora?',
        a: 'Até 7 dias úteis depois de o produto chegar. Se tiveres um prazo mais apertado, diz-me no primeiro contacto e eu digo-te se consigo.',
      },
      {
        q: 'Quantas revisões estão incluídas?',
        a: 'Uma rodada de comentários sobre a primeira versão. Revisões adicionais custam 25€.',
      },
      {
        q: 'Consigo usar os vídeos em anúncios pagos?',
        a: 'Sim. Os direitos para Ads são um extra de 75€ por vídeo, válidos por 6 meses.',
      },
      {
        q: 'Preciso de enviar o produto?',
        a: 'Sim. O prazo de entrega começa a contar quando o produto chega.',
      },
      {
        q: 'Fazes variações do mesmo vídeo?',
        a: 'Sim. Gravo aberturas diferentes na mesma sessão para poderes testar qual funciona melhor.',
      },
      {
        q: 'Apareces com o rosto nos vídeos?',
        a: 'Sim, e também gravo com voice-over quando o produto pede.',
      },
      { q: 'Em que idiomas gravas?', a: 'Em português.' },
    ],
  },
  footer: {
    eyebrow: 'Fim da sessão',
    titleLead: 'Diz-me o que precisas de',
    titleEm: 'gravar.',
    lead: 'Não precisas de trazer briefing nem guião. Ajuda se me disseres a marca, o produto, o tipo de vídeo, quantos e para onde vão.',
    cta: 'Contar o que precisas gravar',
    igPrefix: 'Ou manda mensagem no Instagram,',
    image: '/img/img-14.jpg',
    imageAlt: 'Retrato de Carol Queiroz ao fim da tarde',
    video: {
      src: '/videos/footer-loop.mp4',
      srcSm: '/videos/footer-loop-sm.mp4',
    },
    barLeft: 'Carol Queiroz · UGC Creator',
    barRight: 'Portugal · © 2026',
  },
  links: {
    avatar: '/img/img-03.jpg',
    avatarAlt: 'Retrato de Carol Queiroz',
    items: [
      {
        label: 'Portfólio completo',
        note: 'Vídeos, fotos, processo e pacotes',
        href: '/',
        image: '/img/img-01.jpg',
      },
      {
        label: 'Pacotes e preços',
        note: 'A partir de 150€, entrega em 7 dias úteis',
        href: '/#pacotes',
        image: '/img/img-13.jpg',
      },
      {
        label: 'Instagram',
        note: 'Os vídeos mais recentes',
        href: 'https://instagram.com/carolxqueiroz',
        image: '/img/img-06.jpg',
      },
    ],
  },
};

export const wa = (phone: string, text: string) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
