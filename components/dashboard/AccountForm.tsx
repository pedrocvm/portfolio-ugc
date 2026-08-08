'use client';

import { useActionState } from 'react';
import { changePassword, type Result } from '@/app/dashboard/actions';
import { MIN_PASSWORD } from '@/lib/hibp';

export default function AccountForm() {
  const [state, action, pending] = useActionState<Result, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={action} className="acctForm">
      <div className="fld">
        <label>
          Palavra-passe atual
          <input
            type="password"
            name="current"
            autoComplete="current-password"
            required
          />
        </label>
      </div>
      <div className="fld">
        <label>
          Nova palavra-passe
          <input
            type="password"
            name="next"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
        </label>
        <p className="hint">
          Pelo menos {MIN_PASSWORD} caracteres. É verificada contra fugas de
          dados conhecidas antes de ser aceite.
        </p>
      </div>
      <div className="fld">
        <label>
          Repetir a nova palavra-passe
          <input
            type="password"
            name="repeat"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
        </label>
      </div>
      {state.error ? <p className="loginErr">{state.error}</p> : null}
      {state.ok ? <p className="okMsg">Palavra-passe alterada.</p> : null}
      <button className="btn solid" type="submit" disabled={pending}>
        {pending ? 'A verificar…' : 'Mudar palavra-passe'}
      </button>
    </form>
  );
}
