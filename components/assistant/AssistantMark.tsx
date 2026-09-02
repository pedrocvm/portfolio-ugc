'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/** A marca do Carol AI.
 *
 *  Um balão de conversa dizia «chatbot». A inicial dela dizia «Carol» mas não
 *  dizia o que o botão faz. O brilho de quatro pontas é o glifo que hoje toda a
 *  gente lê como inteligência artificial — desenhado com a mão dela, dentro do
 *  traço aberto onde a caneta levantou.
 *
 *  A animação é GSAP e não CSS porque são três estados a partilhar as mesmas
 *  formas: parado respira, a pensar roda e pulsa, ao passar por cima acorda.
 *  Encadear e interromper isso em `@keyframes` seria três conjuntos de regras a
 *  lutar pela mesma propriedade. */
export default function AssistantMark({ state }: { state: 'idle' | 'busy' }) {
  const root = useRef<HTMLSpanElement>(null);
  const spin = useRef<gsap.core.Tween | null>(null);
  const pulse = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // Quem pediu menos movimento recebe a marca parada, e nada mais.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const ring = el.querySelector('.aiMarkRing');
      const spark = el.querySelector('.aiMarkSpark');
      const dust = el.querySelector('.aiMarkDust');

      // Entrada: o traço fecha-se como quem o desenha, e o brilho chega depois.
      gsap.set(ring, { strokeDasharray: 118, strokeDashoffset: 118 });
      gsap.set([spark, dust], { scale: 0, transformOrigin: '50% 50%' });

      gsap
        .timeline()
        .to(ring, { strokeDashoffset: 0, duration: 0.85, ease: 'power2.inOut' })
        .to(spark, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, '-=0.35')
        .to(dust, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, '-=0.3');

      spin.current = gsap.to(ring, {
        rotation: 360,
        duration: 2.4,
        ease: 'none',
        repeat: -1,
        transformOrigin: '50% 50%',
        paused: true,
      });

      // Parado, um cintilar de vez em quando: presente sem chamar por ela.
      pulse.current = gsap
        .timeline({ repeat: -1, repeatDelay: 3.5, paused: true })
        .to(spark, { scale: 1.16, duration: 0.5, ease: 'sine.inOut' })
        .to(spark, { scale: 1, duration: 0.6, ease: 'sine.inOut' })
        .to(dust, { scale: 1.3, opacity: 1, duration: 0.4, ease: 'sine.inOut' }, '-=0.8')
        .to(dust, { scale: 1, opacity: 0.7, duration: 0.5 }, '-=0.2');
    }, el);

    return () => {
      spin.current = null;
      pulse.current = null;
      ctx.revert();
    };
  }, []);

  useEffect(() => {
    const busy = state === 'busy';
    // Pensando, a caneta anda: o traço roda e o brilho respira depressa.
    if (busy) {
      spin.current?.play();
      pulse.current?.pause();
      gsap.to('.aiMarkSpark', { scale: 1.1, duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    } else {
      spin.current?.pause();
      gsap.killTweensOf('.aiMarkSpark');
      gsap.to('.aiMarkSpark', { scale: 1, rotation: 0, duration: 0.4, ease: 'power2.out' });
      pulse.current?.restart(true);
    }
  }, [state]);

  return (
    <span className="aiMark" data-state={state} aria-hidden="true" ref={root}>
      <svg viewBox="0 0 44 44" focusable="false">
        {/* O traço fechado à mão: raios desiguais, apoios ligeiramente fora,
            e a abertura onde a caneta levantou. */}
        <path
          className="aiMarkRing"
          d="M23.4 4.6c9.3.3 16.7 7.2 16.6 16.1-.1 9.8-7.9 18.6-18.4 18.7C11.6 39.5 4.1 32.2 4.4 22.3 4.7 13 11.7 5.4 21 4.6"
        />
        <path
          className="aiMarkSpark"
          d="M20.6 11.4c1 6.1 3.6 8.7 9.7 9.7-6.1 1-8.7 3.6-9.7 9.7-1-6.1-3.6-8.7-9.7-9.7 6.1-1 8.7-3.6 9.7-9.7Z"
        />
        <path className="aiMarkDust" d="M31 26.6c.4 2.3 1.4 3.3 3.7 3.7-2.3.4-3.3 1.4-3.7 3.7-.4-2.3-1.4-3.3-3.7-3.7 2.3-.4 3.3-1.4 3.7-3.7Z" />
      </svg>
    </span>
  );
}
