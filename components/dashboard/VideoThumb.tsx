'use client';

import { useEffect, useRef, useState } from 'react';

/** A miniatura só vai buscar o vídeo quando entra na tela. A biblioteca mostra
 *  dezenas de uma vez e todas pediam o arquivo à chegada: bastava abrir a tela
 *  para gastar centenas de MB do tráfego do Storage, que numa conta gratuita
 *  acaba e derruba o site público junto. Fora da tela não custa nada; o
 *  primeiro quadro aparece assim que há dados para o desenhar. */
export default function VideoThumb({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setVisible(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [visible]);

  return (
    <video
      ref={ref}
      {...(visible ? { src } : {})}
      muted
      playsInline
      preload={visible ? 'metadata' : 'none'}
      onLoadedData={(e) => {
        const v = e.currentTarget;
        if (v.currentTime === 0) v.currentTime = 0.01;
      }}
    />
  );
}
