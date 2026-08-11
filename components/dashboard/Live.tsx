'use client';

import { useEffect, useState } from 'react';
import Site from '@/components/Site';
import type { Content } from '@/lib/content';

/** A janela do editor manda o que está no formulário; assim a pré-visualização
 *  mostra o que ainda não foi guardado. */
export default function Live({
  initial,
  media,
}: {
  initial: Content;
  media: Record<string, string[]>;
}) {
  const [content, setContent] = useState(initial);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'draft') setContent(e.data.content as Content);
    }
    window.addEventListener('message', onMessage);
    window.parent?.postMessage({ type: 'ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return <Site c={content} media={media} />;
}
