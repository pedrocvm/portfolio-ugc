'use client';

import { useEffect, useRef } from 'react';

type Mote = { x: number; y: number; r: number; a: number; vy: number; sway: number; phase: number };

/** Poeira em suspensão. Só se vê nas cenas escuras; para sozinha se a aba sair de vista. */
export default function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let motes: Mote[] = [];
    let raf = 0;
    let t = 0;

    function seed() {
      const n = Math.round(Math.min(70, (w * h) / 26000));
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 1.5,
        a: 0.06 + Math.random() * 0.22,
        vy: 0.06 + Math.random() * 0.18,
        sway: 6 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      cv!.width = Math.round(w * dpr);
      cv!.height = Math.round(h * dpr);
      cv!.style.width = `${w}px`;
      cv!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    /* o gradiente e desenhado uma vez para um sprite: criar um por mote e por
       frame custava ~4000 alocacoes por segundo na thread principal */
    const SP = 64;
    const spr = document.createElement('canvas');
    spr.width = SP;
    spr.height = SP;
    const sctx = spr.getContext('2d')!;
    const sg = sctx.createRadialGradient(SP / 2, SP / 2, 0, SP / 2, SP / 2, SP / 2);
    sg.addColorStop(0, 'rgba(247,243,238,1)');
    sg.addColorStop(1, 'rgba(247,243,238,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, SP, SP);

    function frame() {
      t += 0.006;
      ctx!.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y -= m.vy;
        if (m.y < -6) {
          m.y = h + 6;
          m.x = Math.random() * w;
        }
        const x = m.x + Math.sin(t + m.phase) * m.sway;
        const d = m.r * 8;
        ctx!.globalAlpha = m.a;
        ctx!.drawImage(spr, x - d / 2, m.y - d / 2, d, d);
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    /* so se ve em cenas escuras: nas claras nao ha nada para desenhar.
       o stop espera pela transicao de opacidade do CSS para nao congelar o fade */
    let stopAt = 0;
    function running() {
      return !document.hidden && (document.body.dataset.mode === 'dark' || Date.now() < stopAt);
    }
    function sync() {
      cancelAnimationFrame(raf);
      if (running()) raf = requestAnimationFrame(frame);
      else ctx!.clearRect(0, 0, w, h);
    }
    function onMode() {
      if (document.body.dataset.mode !== 'dark') stopAt = Date.now() + 1400;
      sync();
      if (document.body.dataset.mode !== 'dark') setTimeout(sync, 1500);
    }

    const mo = new MutationObserver(onMode);
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });

    resize();
    sync();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return <canvas id="dust" ref={ref} aria-hidden="true" />;
}
