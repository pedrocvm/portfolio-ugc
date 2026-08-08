import type { Metadata, Viewport } from 'next';
import {
  Archivo,
  Instrument_Sans,
  Instrument_Serif,
  Space_Mono,
  Tangerine,
} from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-disp',
  display: 'swap',
  preload: false,
});
const sans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-sans',
  display: 'swap',
  preload: false,
});
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--font-serif',
  display: 'swap',
  preload: false,
});
const mono = Space_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-mono',
  display: 'swap',
});
const script = Tangerine({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
});

const fontVars = [archivo, sans, serif, mono, script]
  .map((f) => f.variable)
  .join(' ');

export const metadata: Metadata = {
  metadataBase: new URL('https://portfolio-ugc.vercel.app'),
  title: 'Carol Queiroz — UGC Creator · Sessão privada',
  description:
    'Vídeos UGC em português para marcas de casa e decor, cabelo, skincare, tecnologia e serviços. A partir de 150€.',
  openGraph: {
    title: 'Carol Queiroz — UGC Creator',
    description:
      'Vídeos UGC em português para marcas. A partir de 150€, entrega em 7 dias úteis.',
    locale: 'pt_PT',
    type: 'website',
    images: ['/img/img-01.jpg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2e2c2a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" className={fontVars} suppressHydrationWarning>
      <body data-mode="dark">{children}</body>
    </html>
  );
}
