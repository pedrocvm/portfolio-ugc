import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/dashboard/LoginForm';
import { currentEditor } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Área privada',
  robots: { index: false, follow: false },
};

function safeNext(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  if (await currentEditor()) redirect(destination);

  return (
    <div className="login">
      <div className="loginBox">
        <h1>Entrar</h1>
        <p className="sub">O site continua mostrando o que já está publicado.</p>
        <LoginForm next={destination} />
        <Link className="loginBack" href="/">
          ← Voltar ao site
        </Link>
      </div>
    </div>
  );
}
