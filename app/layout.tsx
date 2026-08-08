import type { Metadata, Viewport } from 'next';
import {
  Archivo,
  Instrument_Sans,
  Instrument_Serif,
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

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getPublished();
  return {
    metadataBase: new URL('https://portfolio-ugc.vercel.app'),
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
