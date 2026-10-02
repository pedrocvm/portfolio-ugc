import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './dashboard.css';
import './content-manager.css';
import './admin-theme.css';

const adminSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-admin-serif',
  display: 'swap',
  preload: false,
});

const adminSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-admin-sans',
  display: 'swap',
  preload: false,
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${adminSans.variable} ${adminSerif.variable} dash`}>
      {children}
    </div>
  );
}
