'use client';

import { useRef, useState } from 'react';
import { instagramEmbedUrl } from '@/modules/integrations/instagram/normalize';

/** Uma publicação vista sem sair do CarolOS.
 *
 *  O iframe só nasce quando ela abre: uma lista com sessenta peças não pode
 *  carregar sessenta Instagrams. O que não tem embed — um Story, um perfil —
 *  continua a abrir no Instagram, porque não há outra forma. */
export default function InstagramPeek({
  permalink,
  isSharedToFeed,
  label = 'Ver no Instagram',
}: {
  permalink: string;
  isSharedToFeed?: boolean | null;
  label?: string;
}) {
  const caixa = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  const embed = instagramEmbedUrl(permalink, { isSharedToFeed });

  if (!embed) {
    return (
      <a className="chip" href={permalink} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }

  const abrir = () => {
    setAberto(true);
    caixa.current?.showModal();
  };
  const fechar = () => {
    caixa.current?.close();
    setAberto(false);
  };

  return (
    <>
      <button className="chip" type="button" onClick={abrir}>
        {label}
      </button>
      <dialog
        className="igPeek"
        ref={caixa}
        onClick={(e) => {
          if (e.target === caixa.current) fechar();
        }}
        onClose={() => setAberto(false)}
      >
        <div className="igPeekBox">
          <header className="igPeekTop">
            <a href={permalink} target="_blank" rel="noreferrer">
              Abrir no Instagram
            </a>
            <button type="button" onClick={fechar} aria-label="Fechar">
              ×
            </button>
          </header>
          {aberto ? <iframe src={embed} title="Publicação no Instagram" allow="encrypted-media" /> : null}
        </div>
      </dialog>
    </>
  );
}
