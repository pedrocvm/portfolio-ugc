export const WHATSAPP =
  'https://wa.me/351913896987?text=Ol%C3%A1%20Carol%2C%20vi%20o%20teu%20portf%C3%B3lio.%20Sou%20da%20%5Bmarca%5D%2C%20vendemos%20%5Bproduto%5D.%20Estou%20a%20pensar%20em%20%5Btipo%20de%20v%C3%ADdeo%5D%2C%20para%20%5Bcanal%5D.%20Prazo%3A%20%5Bquando%5D.';

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
  '/img/img-13.jpg',
];

export const IMAGES = {
  heroWide: '/img/img-01.jpg',
  heroPortrait: '/img/img-02.jpg',
  meetMain: '/img/img-03.jpg',
  meetSub: '/img/img-04.jpg',
  formats: '/img/img-05.jpg',
  footer: '/img/img-14.jpg',
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
