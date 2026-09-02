import AccountForm from '@/components/dashboard/AccountForm';
import { requireEditor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireEditor();

  return (
    <>
      <div className="dashBar">
        <h1>A minha conta</h1>
        <span className="dashState">{user.email}</span>
      </div>
      <div className="acctBox">
        <h2>Mudar a senha</h2>
        <p>
          É preciso a senha atual para confirmar quem está do outro lado. A
          sessão continua aberta depois da troca.
        </p>
        <AccountForm />
      </div>
    </>
  );
}
