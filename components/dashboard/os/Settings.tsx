'use client';

import { useState, useTransition } from 'react';
import { toggleFlag, triggerJob } from '@/app/dashboard/carolos-actions';
import { FLAG_KEYS, FLAG_LABEL, FLAG_NOTE, type FlagKey, type Flags } from '@/lib/flags';
import { formatDate } from '@/lib/time';
import type { IntegrationHealth, JobSummary } from '@/modules/settings/service';

/** Definições. Bandeiras, integrações e trabalhos de fundo.
 *
 *  A ordem em que se ligam importa: modo sombra primeiro, automação depois de
 *  a Carol ter visto o que o sistema propõe e concordar. */

const JOBS = [
  { id: 'gmail-sync', label: 'Sincronizar Gmail' },
  { id: 'process-pending', label: 'Processar pendentes' },
  { id: 'followups', label: 'Actualizar follow-ups' },
  { id: 'rights', label: 'Verificar licenças' },
  { id: 'upsell', label: 'Procurar upsell' },
  { id: 'plan', label: 'Recalcular a fila' },
];

const STATUS_LABEL: Record<string, string> = {
  connected: 'ligado',
  error: 'com erro',
  revoked: 'revogado',
  paused: 'em pausa',
  disconnected: 'não ligado',
};

export default function Settings({
  flags, integration, jobs, googleConfigured, aiConfigured, serviceRole, encryptionKey,
  policyVersion, policyStatus, notice,
}: {
  flags: Flags;
  integration: IntegrationHealth;
  jobs: JobSummary[];
  googleConfigured: boolean;
  aiConfigured: boolean;
  serviceRole: boolean;
  encryptionKey: boolean;
  policyVersion: string;
  policyStatus: string;
  notice: string | null;
}) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState(flags);
  const [message, setMessage] = useState('');

  const flip = (key: FlagKey) =>
    start(async () => {
      const next = !local[key];
      setLocal((f) => ({ ...f, [key]: next }));
      await toggleFlag(key, next);
    });

  const missing: string[] = [];
  if (!serviceRole) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!encryptionKey) missing.push('APP_ENCRYPTION_KEY');
  if (!googleConfigured) missing.push('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET');
  if (!aiConfigured) missing.push('ANTHROPIC_API_KEY');

  return (
    <>
      <div className="dashBar">
        <h1>Definições</h1>
      </div>

      {notice === 'connected' ? (
        <p className="osWarn" data-tone="ok">Gmail ligado.</p>
      ) : notice === 'error' ? (
        <p className="osWarn">A ligação ao Gmail não se completou. Tenta outra vez.</p>
      ) : null}

      {missing.length ? (
        <p className="osWarn" data-tone="info">
          Falta configurar no ambiente: {missing.join(', ')}. As áreas que dependem disso ficam
          preparadas mas inertes — nada rebenta, apenas não corre.
        </p>
      ) : null}

      <section className="osSection">
        <h2>Gmail</h2>
        <p className="osNote">
          É a integração que torna o CRM passivo. Pede só leitura e criação de rascunhos: não há
          permissão para enviar, por desenho.
        </p>

        <div className="osStats">
          <div className="osStat">
            <b><em>{STATUS_LABEL[integration.status] ?? integration.status}</em></b>
            <span>{integration.account || 'sem conta ligada'}</span>
          </div>
          <div className="osStat">
            <b><em>{integration.lastSuccessAt ? formatDate(integration.lastSuccessAt) : '—'}</em></b>
            <span>última sincronização</span>
          </div>
          <div className="osStat">
            <b><em>{integration.cursor ? `${integration.cursor.slice(0, 10)}…` : '—'}</em></b>
            <span>cursor</span>
          </div>
        </div>

        {integration.lastErrorCode ? (
          <p className="osWarn">
            Último erro: {integration.lastErrorCode}
            {integration.lastErrorAt ? ` (${formatDate(integration.lastErrorAt)})` : ''}.
          </p>
        ) : null}

        <div className="osActs">
          {googleConfigured ? (
            <a className="btn" href="/api/integrations/google/oauth/start">
              {integration.status === 'connected' ? 'Voltar a autorizar' : 'Ligar o Gmail'}
            </a>
          ) : (
            <span className="osRowSub">
              Sem GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente, o botão de ligar não faz nada.
            </span>
          )}
          {integration.status === 'connected' ? (
            <button
              className="chip"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await fetch('/api/integrations/google/disconnect', { method: 'POST' });
                  setMessage('Ligação removida e autorização revogada no Google.');
                })
              }
            >
              Desligar
            </button>
          ) : null}
        </div>
      </section>

      <section className="osSection">
        <h2>Automação</h2>
        <p className="osNote">
          Começa com o modo sombra. Só depois de veres o que o sistema propõe, e concordares, é que
          vale a pena deixá-lo aplicar sozinho.
        </p>

        {FLAG_KEYS.map((key) => (
          <div className="osFlag" key={key}>
            <div>
              <b>{FLAG_LABEL[key]}</b>
              <p>{FLAG_NOTE[key]}</p>
            </div>
            <button
              className="osSwitch"
              type="button"
              aria-pressed={local[key]}
              disabled={pending}
              onClick={() => flip(key)}
            >
              {local[key] ? 'ligado' : 'desligado'}
            </button>
          </div>
        ))}

        {local.external_send ? (
          <p className="osWarn">
            O envio externo automático está ligado. Enquanto estiver assim, uma mensagem comercial
            pode sair sem tu a leres. Só deixes assim se for mesmo o que queres.
          </p>
        ) : null}
      </section>

      <section className="osSection">
        <h2>Preço</h2>
        <p className="osNote">
          Política em uso: <b>{policyVersion}</b> ({policyStatus}). Enquanto uma regra estiver por
          decidir, o motor diz «por resolver» em vez de inventar um valor.
        </p>
      </section>

      <section className="osSection">
        <h2>Correr agora</h2>
        <p className="osNote">
          Os trabalhos correm sozinhos quando o cron estiver ligado. Estes botões são para quando
          não quiseres esperar.
        </p>
        <div className="osActs">
          {JOBS.map((j) => (
            <button
              key={j.id}
              className="chip"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await triggerJob(j.id);
                  setMessage(result.error ? `${j.label}: ${result.error}` : `${j.label}: ${JSON.stringify(result.detail)}`);
                })
              }
            >
              {j.label}
            </button>
          ))}
        </div>
        {message ? <p className="osWarn" data-tone="info">{message}</p> : null}

        {jobs.length ? (
          <div className="osRows" style={{ marginTop: 18 }}>
            {jobs.map((j) => (
              <div className="osRow" key={j.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 16 }}>{j.jobType}</span>
                  <p className="osRowSub">
                    {formatDate(j.startedAt)} · {j.itemsProcessed} item(ns)
                    {j.errorSummary ? ` · ${j.errorSummary.slice(0, 120)}` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={j.status === 'success' ? 'ok' : j.status === 'error' ? 'bad' : 'mute'}>
                    {j.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
