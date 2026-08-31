import type { Metadata, Viewport } from 'next';
import {
  Archivo,
  Instrument_Sans,
  Lora,
  Space_Mono,
  Tangerine,
} from 'next/font/google';
import { getPublished } from '@/lib/content-store';
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
/* A Instrument Serif é uma fonte de cartaz: linda a 60px, ilegível a 15.
 * A Lora é uma serifa de texto, desenhada para corpo em ecrã, e o itálico
 * continua a existir onde o design o pede — mas agora lê-se. */
const serif = Lora({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
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

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getPublished();
  return {
    metadataBase: new URL('https://carolqueiroz.pt'),
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      locale: 'pt_PT',
      type: 'website',
      images: [meta.ogImage],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
