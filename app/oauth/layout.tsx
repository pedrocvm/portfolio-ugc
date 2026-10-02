import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './oauth.css';

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--oauth-serif',
  display: 'swap',
  preload: false,
});

const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--oauth-sans',
  display: 'swap',
  preload: false,
});

export default function OAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${serif.variable} ${sans.variable} oauthShell`}>{children}</div>;
}
