const PHONE = '351913896987';

export const wa = (text: string) =>
  `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`;

export const WHATSAPP = wa(
  'Olá Carol, vi o teu portfólio e gostaria de saber mais sobre o teu trabalho.',
);

export const INSTAGRAM = 'https://instagram.com/carolxqueiroz';

export const NAV_LINKS = [
  { href: '#meet', label: 'Sobre' },
  { href: '#formatos', label: 'Formatos' },
  { href: '#fotos', label: 'Fotos' },
  { href: '#processo', label: 'Processo' },
  { href: '#pacotes', label: 'Pacotes' },
  { href: '#faq', label: 'FAQ' },
];

export const TAKES = [
  { n: '01', niche: 'Casa & Decor', img: '/img/img-15.jpg' },
  { n: '02', niche: 'Casa & Decor', img: '/img/img-16.jpg' },
  { n: '03', niche: 'Cabelo', img: '/img/img-17.jpg' },
  { n: '04', niche: 'Tech', img: '/img/img-18.jpg' },
  { n: '05', niche: 'Skincare', img: '/img/img-19.jpg' },
  { n: '06', niche: 'Serviços', img: '/img/img-20.jpg' },
];

export const NICHES = ['Casa & Decor', 'Cabelo', 'Tech', 'Skincare', 'Serviços'];

export const PHOTOS = [
  '/img/img-06.jpg',
  '/img/img-07.jpg',
  '/img/img-08.jpg',
  '/img/img-09.jpg',
  '/img/img-10.jpg',
  '/img/img-11.jpg',
  '/img/img-12.jpg',
];

export const IMAGES = {
  heroWide: '/img/img-01.jpg',
  heroWideAvif: '/img/img-01.avif',
  heroWideWebp: '/img/img-01.webp',
  heroPortrait: '/img/img-02.jpg',
  heroPortraitAvif: '/img/img-02.avif',
  heroPortraitWebp: '/img/img-02.webp',
  meetMain: '/img/img-03.jpg',
  meetSub: '/img/img-04.jpg',
  formats: '/img/img-13.jpg',
  formatsAvif: '/img/img-13.avif',
  formatsWebp: '/img/img-13.webp',
  formatsSm: '/img/img-13-sm.jpg',
  formatsSmAvif: '/img/img-13-sm.avif',
  formatsSmWebp: '/img/img-13-sm.webp',
  footer: '/img/img-14.jpg',
};

export const VIDEOS = {
  hero: '/videos/hero-loop.mp4',
  heroSm: '/videos/hero-loop-sm.mp4',
  formats: '/videos/hero-2-loop.mp4',
  formatsSm: '/videos/hero-2-loop-sm.mp4',
  footer: '/videos/footer-loop.mp4',
  footerSm: '/videos/footer-loop-sm.mp4',
};

export type Plan = {
  name: string;
  best?: boolean;
  avulso: { price: string; suffix: string; qty: string; unit: string };
  mensal: { price: string; suffix: string; qty: string; unit: string };
  feat: string[];
};

export const PLANS: Plan[] = [
  {
    name: 'Tester',
    avulso: { price: '150', suffix: '', qty: '1 vídeo', unit: '150€ por vídeo' },
    mensal: { price: '270', suffix: '/mês', qty: '2 vídeos por mês', unit: '135€ por vídeo' },
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
    avulso: { price: '405', suffix: '', qty: '3 vídeos', unit: '135€ por vídeo' },
    mensal: { price: '500', suffix: '/mês', qty: '4 vídeos por mês', unit: '125€ por vídeo' },
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
    avulso: { price: '625', suffix: '', qty: '5 vídeos', unit: '125€ por vídeo' },
    mensal: { price: '920', suffix: '/mês', qty: '8 vídeos por mês', unit: '115€ por vídeo' },
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
];

export const FAQ = [
  ['Tenho de trazer guião?', 'Não. Diz-me o produto e para onde vai o vídeo, e eu proponho a abordagem.'],
  ['Quanto tempo demora?', 'Até 7 dias úteis depois de o produto chegar. Se tiveres um prazo mais apertado, diz-me no primeiro contacto e eu digo-te se consigo.'],
  ['Quantas revisões estão incluídas?', 'Uma rodada de comentários sobre a primeira versão. Revisões adicionais custam 25€.'],
  ['Consigo usar os vídeos em anúncios pagos?', 'Sim. Os direitos para Ads são um extra de 75€ por vídeo, válidos por 6 meses.'],
  ['Preciso de enviar o produto?', 'Sim. O prazo de entrega começa a contar quando o produto chega.'],
  ['Fazes variações do mesmo vídeo?', 'Sim. Gravo aberturas diferentes na mesma sessão para poderes testar qual funciona melhor.'],
  ['Apareces com o rosto nos vídeos?', 'Sim, e também gravo com voice-over quando o produto pede.'],
  ['Em que idiomas gravas?', 'Em português.'],
] as const;
