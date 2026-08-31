'use client';

import { useState, useTransition } from 'react';
import { toggleFlag, triggerJob } from '@/app/dashboard/carolos-actions';
import { FLAG_KEYS, FLAG_LABEL, FLAG_NOTE, type FlagKey, type Flags } from '@/lib/flags';
import { formatDate } from '@/lib/time';
import { jobLabel, label } from '@/lib/labels';
import type { SchedulerState } from '@/modules/jobs/domain';
import type { IntegrationHealth, JobSummary } from '@/modules/settings/service';
import Spinner from '@/components/dashboard/Spinner';
import Scheduler from './Scheduler';

/** Definições. Bandeiras, integrações e trabalhos de fundo.
 *
 *  A ordem em que se ligam importa: modo sombra primeiro, automação depois de
 *  a Carol ter visto o que o sistema propõe e concordar. */

const JOBS = [
  { id: 'gmail-sync', label: 'Sincronizar Gmail' },
  { id: 'process-pending', label: 'Processar pendentes' },
  { id: 'followups', label: 'Actualizar follow-ups' },
  { id: 'rights', label: 'Verificar licenças' },
  { id: 'metrics', label: 'Lembretes de métricas' },
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
  flags, mailboxes, jobs, googleConfigured, aiConfigured, serviceRole, encryptionKey,
  policyVersion, policyStatus, notice, scheduler,
}: {
  flags: Flags;
  mailboxes: IntegrationHealth[];
  jobs: JobSummary[];
  scheduler: SchedulerState;
  googleConfigured: boolean;
  aiConfigured: boolean;
  serviceRole: boolean;
  encryptionKey: boolean;
  policyVersion: string;
  policyStatus: string;
  notice: string | null;
}) {
  const [, start] = useTransition();
  const [local, setLocal] = useState(flags);
  const [message, setMessage] = useState('');
  /** Qual acção está a correr. Um booleano partilhado desactivava tudo sem
   *  dizer o que estava a acontecer, e sincronizar o Gmail demora o suficiente
   *  para parecer que o clique se perdeu. */
  const [running, setRunning] = useState<string | null>(null);
  const pending = running !== null;

  const run = (id: string, work: () => Promise<void>) =>
    start(async () => {
      setRunning(id);
      try {
        await work();
      } finally {
        setRunning(null);
      }
    });

  const flip = (key: FlagKey) =>
    run(`flag:${key}`, async () => {
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
          permissão para enviar, por desenho. Podes ligar mais do que uma conta — as marcas nem
          sempre escrevem para a mesma caixa.
        </p>

        {mailboxes.length === 0 ? (
          <p className="osRowSub">Nenhuma conta ligada.</p>
        ) : (
          <div className="osRows">
            {mailboxes.map((m) => (
              <div className="osRow" key={m.id || m.account}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>
                    {m.account || 'conta por identificar'}
                  </span>
                  <span className="osRowSub">
                    {STATUS_LABEL[m.status] ?? m.status}
                    {' · '}
                    {m.lastSuccessAt
                      ? `sincronizada a ${formatDate(m.lastSuccessAt)}`
                      : 'ainda sem sincronização'}
                    {m.lastErrorCode ? ` · último erro: ${m.lastErrorCode}` : ''}
                  </span>
                </div>
                {m.id ? (
                  <button
                    className="chip"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(`disc:${m.id}`, async () => {
                        await fetch('/api/integrations/google/disconnect', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ connectionId: m.id }),
                        });
                        setMessage(`${m.account} desligada e autorização revogada no Google.`);
                      })
                    }
                  >
                    {running === `disc:${m.id}` ? <Spinner label="A desligar" /> : null}
                    Desligar
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="osActs">
          {googleConfigured ? (
            <a className="btn" href="/api/integrations/google/oauth/start">
              {mailboxes.length === 0 ? 'Ligar o Gmail' : 'Ligar outra conta'}
            </a>
          ) : (
            <span className="osRowSub">
              Sem GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente, o botão de ligar não faz nada.
            </span>
          )}
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
              {running === `flag:${key}` ? <Spinner label="A guardar" /> : null}
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

      <Scheduler state={scheduler} />

      <section className="osSection">
        <h2>Correr agora</h2>
        <p className="osNote">
          Os trabalhos já correm sozinhos pelo agendador. Estes botões são para quando não quiseres
          esperar pela próxima passagem.
        </p>
        <div className="osJobs">
          {JOBS.map((j) => (
            <button
              key={j.id}
              className="osJob"
              type="button"
              disabled={pending}
              onClick={() =>
                run(`job:${j.id}`, async () => {
                  const result = await triggerJob(j.id);
                  setMessage(result.error ? `${j.label}: ${result.error}` : `${j.label}: ${JSON.stringify(result.detail)}`);
                })
              }
            >
              {running === `job:${j.id}` ? <Spinner label={`A correr: ${j.label}`} /> : null}
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
                  <span className="osRowName" style={{ fontSize: 16 }}>{jobLabel(j.jobType)}</span>
                  <p className="osRowSub">
                    {formatDate(j.startedAt)} · {j.itemsProcessed} item(ns)
                    {j.errorSummary ? ` · ${j.errorSummary.slice(0, 120)}` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={j.status === 'success' ? 'ok' : j.status === 'error' ? 'bad' : 'mute'}>
                    {label('runStatus', j.status)}
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
