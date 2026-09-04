'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  brandImportStatus, continueBrandImport, discoveryStatus,
} from '@/app/dashboard/outreach-actions';
import { progressText } from '@/modules/outreach/import';
import { pushToast } from './Toasts';

/** Vigia o trabalho que ficou a correr.
 *
 *  Vive no layout, não na tela da Prospeção: ela carrega em «procurar» e vai
 *  para o Inbox, e é lá que quer saber que acabou. O que está a correr fica
 *  no browser, por isso o aviso sobrevive à navegação e a um recarregamento.
 *
 *  Não é um poll ansioso: de cinco em cinco segundos, e desiste ao fim de dez
 *  minutos — mais do que isso e a corrida morreu, não está lenta. */

const KEY = 'carolos.outreach.since';
/** O lote de marcas que ela colou. É outra coisa: tem contagem verdadeira e
 *  pode demorar mais do que um pedido HTTP aguenta. */
const KEY_IMPORT = 'carolos.import.run';
const EVERY_MS = 5000;
const GIVE_UP_MS = 10 * 60_000;
/** Vinte e cinco marcas não cabem num pedido de 300 s. Quando o lote pára de
 *  andar, é porque o trabalhador anterior chegou ao fim do tempo — e retomar é
 *  seguro, porque cada marca é reclamada antes de ser trabalhada. */
const IMPORT_GIVE_UP_MS = 45 * 60_000;
const RETOMAR_APOS_MS = 45_000;

export function watchDiscovery(since: string) {
  try {
    localStorage.setItem(KEY, since);
  } catch {
    /* sem localStorage, o aviso só aparece enquanto ela ficar na tela */
  }
  window.dispatchEvent(new Event('carolos:watch'));
}

export function watchImport(runId: string) {
  try {
    localStorage.setItem(KEY_IMPORT, JSON.stringify({ runId, at: Date.now() }));
  } catch {
    /* idem */
  }
  window.dispatchEvent(new Event('carolos:watch'));
}

const ler = (chave: string) => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};

const limpar = (chave: string) => {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* nada a limpar */
  }
};

export default function DiscoveryWatch() {
  const router = useRouter();
  // Sem isto, uma procura de quatro minutos é indistinguível de nada a
  // acontecer: ela carrega, a tela não muda, e carrega outra vez.
  const [label, setLabel] = useState<string | null>(null);
  /** O último progresso visto e quando. É o que distingue «está devagar» de
   *  «o trabalhador morreu e alguém tem de continuar». */
  const marca = useRef<{ processed: number; at: number }>({ processed: -1, at: 0 });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let parado = false;

    /** O lote colado. Devolve true quando ainda há alguma coisa a vigiar. */
    const olharLote = async (): Promise<boolean> => {
      const bruto = ler(KEY_IMPORT);
      if (!bruto) return false;

      let runId = '';
      let desde = 0;
      try {
        const salvo = JSON.parse(bruto) as { runId: string; at: number };
        runId = salvo.runId;
        desde = salvo.at;
      } catch {
        limpar(KEY_IMPORT);
        return false;
      }

      if (Date.now() - desde > IMPORT_GIVE_UP_MS) {
        limpar(KEY_IMPORT);
        pushToast('O lote demorou demais e eu deixei de esperar. Veja em Prospeção.', 'warn');
        return false;
      }

      const r = await brandImportStatus(runId).catch(() => null);
      // Rede a falhar não é o lote a falhar: tenta outra vez.
      if (!r) return true;

      if (r.status === 'running') {
        setLabel(progressText(r.processed, r.total));
        const parou =
          marca.current.processed === r.processed && Date.now() - marca.current.at > RETOMAR_APOS_MS;
        if (marca.current.processed !== r.processed) {
          marca.current = { processed: r.processed, at: Date.now() };
        } else if (parou) {
          marca.current = { processed: r.processed, at: Date.now() };
          await continueBrandImport(runId).catch(() => null);
        }
        return true;
      }

      limpar(KEY_IMPORT);
      setLabel(null);
      pushToast(r.message || 'O lote acabou.', 'ok', '/dashboard/outreach');
      router.refresh();
      return false;
    };

    /** A procura de marcas novas. */
    const olharProcura = async (): Promise<boolean> => {
      const since = ler(KEY);
      if (!since) return false;

      if (Date.now() - new Date(since).getTime() > GIVE_UP_MS) {
        limpar(KEY);
        setLabel(null);
        pushToast('A procura demorou demais e eu deixei de esperar. Veja em Prospeção.', 'warn');
        return false;
      }

      setLabel('Procurando marcas');
      const r = await discoveryStatus(since).catch(() => null);
      if (!r) return true;
      if (r.state !== 'done') return true;

      limpar(KEY);
      setLabel(null);
      pushToast(r.message ?? 'A procura acabou.', 'ok', '/dashboard/outreach');
      router.refresh();
      return false;
    };

    const tick = async () => {
      if (parado) return;
      // O lote primeiro: quando os dois estão a correr, é o que tem contagem
      // verdadeira para mostrar.
      const lote = await olharLote();
      const procura = await olharProcura();
      if (!lote && !procura) setLabel(null);
      if (!parado) timer = setTimeout(tick, EVERY_MS);
    };

    const arranca = () => {
      clearTimeout(timer);
      // Aparecer só ao primeiro tick punha o indicador cinco segundos depois
      // do clique, que é precisamente quando ela duvida se carregou.
      if (ler(KEY_IMPORT)) setLabel('Pesquisando suas marcas');
      else if (ler(KEY)) setLabel('Procurando marcas');
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

  if (!label) return null;
  return (
    <div className="findingChip" role="status">
      <span className="findingDot" aria-hidden="true" />
      {label}
    </div>
  );
}
