'use client';

import { useActionState } from 'react';
import { signIn, type Result } from '@/app/dashboard/actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState<Result, FormData>(signIn, {});

  return (
    <form action={action}>
      <div className="fld">
        <label>
          Utilizador
          <input
            type="text"
            name="id"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
      </div>
      <div className="fld">
        <label>
          Palavra-passe
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
      </div>
      {state.error ? <p className="loginErr">{state.error}</p> : null}
      <button className="btn solid" type="submit" disabled={pending}>
        {pending ? 'A entrar…' : 'Entrar'}
      </button>
    </form>
  );
}
