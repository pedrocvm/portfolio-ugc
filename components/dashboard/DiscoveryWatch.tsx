'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { discoveryStatus } from '@/app/dashboard/outreach-actions';
import { pushToast } from './Toasts';

/** Vigia a procura que ficou a correr.
 *
 *  Vive no layout, não na tela da Prospecção: ela carrega em «procurar» e vai
 *  para o Inbox, e é lá que quer saber que acabou. O instante de arranque fica
 *  no browser, por isso o aviso sobrevive à navegação e a um recarregamento.
 *
 *  Não é um poll ansioso: de cinco em cinco segundos, e desiste ao fim de dez
 *  minutos — mais do que isso e a corrida morreu, não está lenta. */

const KEY = 'carolos.outreach.since';
const EVERY_MS = 5000;
const GIVE_UP_MS = 10 * 60_000;

export function watchDiscovery(since: string) {
  try {
    localStorage.setItem(KEY, since);
  } catch {
    /* sem localStorage, o aviso só aparece enquanto ela ficar na tela */
  }
  window.dispatchEvent(new Event('carolos:watch'));
}

export default function DiscoveryWatch() {
  const router = useRouter();
  // Sem isto, uma procura de quatro minutos é indistinguível de nada a
  // acontecer: ela carrega, a tela não muda, e carrega outra vez.
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let parado = false;

    const stop = () => {
      setRunning(false);
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nada a limpar */
      }
    };

    const tick = async () => {
      if (parado) return;
      let since: string | null = null;
      try {
        since = localStorage.getItem(KEY);
      } catch {
        return;
      }
      if (!since) {
        setRunning(false);
        return;
      }
      setRunning(true);

      if (Date.now() - new Date(since).getTime() > GIVE_UP_MS) {
        stop();
        pushToast('A procura demorou demais e eu deixei de esperar. Veja em Prospecção.', 'warn');
        return;
      }

      try {
        const r = await discoveryStatus(since);
        if (r.state === 'done') {
          stop();
          pushToast(r.message ?? 'A procura acabou.', 'ok', '/dashboard/outreach');
          router.refresh();
          return;
        }
      } catch {
        /* rede a falhar não é a corrida a falhar: tenta outra vez */
      }
      timer = setTimeout(tick, EVERY_MS);
    };

    const arranca = () => {
      clearTimeout(timer);
      try {
        // Aparecer só ao primeiro tick punha o indicador cinco segundos depois
        // do clique, que é precisamente quando ela duvida se carregou.
        if (localStorage.getItem(KEY)) setRunning(true);
      } catch {
        /* sem armazenamento, aparece ao primeiro tick */
      }
      timer = setTimeout(tick, EVERY_MS);
    };

    arranca();
    window.addEventListener('carolos:watch', arranca);
    return () => {
      parado = true;
      clearTimeout(timer);
      window.removeEventListener('carolos:watch', arranca);
    };
  }, [router]);

  if (!running) return null;
  return (
    <div className="findingChip" role="status">
      <span className="findingDot" aria-hidden="true" />
      A procurar marcas
    </div>
  );
}
