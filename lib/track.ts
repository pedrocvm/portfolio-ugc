/** Os acessos à página de ligações. Sem cookies e sem armazenamento: o
 *  identificador da visita vive na memória desta aba e morre com ela, o que
 *  chega para ligar um clique à visita que o gerou sem seguir ninguém. */

export type LinkEventType = 'view' | 'click' | 'contact' | 'share';

let visita = '';
const sessionId = () => (visita ||= crypto.randomUUID());

export function track(type: LinkEventType, target = '') {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    type,
    target,
    session: sessionId(),
    referrer: document.referrer,
    search: window.location.search,
  });

  /* sendBeacon sobrevive à navegação que o próprio clique provoca; o fetch é
     a saída para quem não o tem, e keepalive faz o mesmo trabalho */
  if (navigator.sendBeacon?.(
    '/api/track',
    new Blob([body], { type: 'application/json' }),
  )) {
    return;
  }
  void fetch('/api/track', {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'application/json' },
  }).catch(() => {});
}
