import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/dashboard/LoginForm';
import { currentEditor } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Área privada',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await currentEditor()) redirect('/dashboard');

  return (
    <div className="login">
      <div className="loginBox">
        <span className="eyeb">Área privada</span>
        <h1>Entrar</h1>
        <p className="sub">O site continua a mostrar o que já está publicado.</p>
        <LoginForm />
        <Link className="loginBack" href="/">
          ← Voltar ao site
        </Link>
      </div>
    </div>
  );
}
