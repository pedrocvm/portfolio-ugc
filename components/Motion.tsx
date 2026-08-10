'use client';

import { useEffect } from 'react';

export default function Motion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* cada video escolhe a fonte pela largura e so carrega quando a seccao se
       aproxima. a troca para o video espera pelo canplay: assim a imagem cobre
       o intervalo e nao e preciso poster nenhum */
    if (!reduce) {
      document.querySelectorAll<HTMLVideoElement>('video[data-src]').forEach((v) => {
        const small = !window.matchMedia('(min-width: 900px)').matches;
        const src = (small && v.dataset.srcSm) || v.dataset.src;
        if (!src) return;
        const box = v.parentElement ?? v;
        const io = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            io.disconnect();
            v.addEventListener(
              'canplay',
              () => box.setAttribute('data-video', ''),
              { once: true },
            );
            v.src = src;
          },
          { rootMargin: '300px' },
        );
        io.observe(box);
      });
    }

    if (reduce) {
      document.documentElement.classList.add('no-motion');
      paintScenes();
      return;
    }

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      cleanup = run(gsap, ScrollTrigger);
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}

function paintScenes() {
  document.querySelectorAll<HTMLElement>('.scene').forEach((sc) => {
    sc.style.background = sc.dataset.bg ?? '';
  });
  const fill = document.getElementById('progFill');
  if (fill) fill.style.width = '100%';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function run(gsap: any, ScrollTrigger: any) {
  const ctx = gsap.context(() => {
    /* a abertura (nome + barras) e agora CSS: comeca no primeiro paint em vez
       de esperar por hidratar + import do gsap, que era 92% do LCP */
    gsap.fromTo(
      '#hero .bgimg img, #hero .bgimg video',
      { scale: 1.08 },
      { scale: 1, duration: 3.2, ease: 'power2.out' },
    );

    /* fundo contínuo */
    const bg = document.getElementById('bg');
    const scenes = Array.from(
      document.querySelectorAll<HTMLElement>('.scene, .chap.dark'),
    );
    let bgCurrent: HTMLElement | null = null;

    function sceneAt(y: number) {
      let inside = false;
      let pick = scenes[0];
      for (const s of scenes) {
        const r = s.getBoundingClientRect();
        if (r.top <= y && (r.bottom > y || !inside)) pick = s;
        if (r.top <= y && r.bottom > y) inside = true;
      }
      return pick;
    }
    function updBg() {
      const pick = sceneAt(window.innerHeight * 0.55);
      if (!pick || pick === bgCurrent) return;
      bgCurrent = pick;
      document.body.dataset.mode = pick.dataset.mode ?? 'light';
      document.body.dataset.scene = pick.id;
      gsap.to(bg, {
        backgroundColor: pick.dataset.bg,
        duration: 0.8,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
    updBg();
    window.addEventListener('scroll', updBg, { passive: true });
    window.addEventListener('resize', updBg);

    /* hero reage ao scroll — criado só depois da entrada, com valores de
       partida explícitos: um scrub criado a meio do fade-in grava o estado
       intermédio e nunca mais restaura o original */
    gsap.fromTo(
      '#hero .name',
      { yPercent: 0, opacity: 1 },
      {
        yPercent: -14,
        opacity: 0.25,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.6,
        },
      },
    );

    /* apresentação */
    gsap.from('#meet h2', {
      y: 30,
      opacity: 0,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#meet', start: 'top 70%' },
    });
    gsap.from('#meet .nichos button', {
      y: 18,
      opacity: 0,
      duration: 0.45,
      stagger: 0.07,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#meet .nichos', start: 'top 80%' },
    });
    gsap.from('#meet .fm.main', {
      y: 48,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#meet .shot', start: 'top 80%' },
    });
    gsap.fromTo(
      '#meet .fm.main img',
      { scale: 1.09, yPercent: -3 },
      {
        scale: 1,
        yPercent: 3,
        ease: 'none',
        scrollTrigger: {
          trigger: '#meet .shot',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      },
    );

    /* a sessão */
    const takeEls = Array.from(
      document.querySelectorAll<HTMLElement>('#frame .takeV'),
    );
    const ambImgs = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#sessao .ambient img, #sessao .ambient video',
      ),
    );
    ambImgs[0]?.classList.add('on');
    /* uma tomada pode ser vídeo: só corre a que está à vista, senão são seis
       streams a decodificar ao mesmo tempo. */
    const takeVideo = (el?: HTMLElement) =>
      el?.querySelector<HTMLVideoElement>('video') ?? null;
    const total = String(takeEls.length).padStart(2, '0');
    const bignum = document.getElementById('bignum');
    const counter = document.getElementById('counter');
    const fichaTxt = document.getElementById('fichaTxt');
    const progFill = document.getElementById('progFill');
    let current = 0;

    function setTake(i: number) {
      if (i === current) return;
      const prev = current;
      current = i;
      const goingDown = i > prev;
      gsap.to(takeEls[prev], {
        opacity: 0,
        scale: 0.96,
        duration: 0.22,
        ease: 'power1.out',
        onComplete() {
          takeEls[prev].classList.remove('on');
          gsap.set(takeEls[prev], { clearProps: 'all' });
        },
      });
      takeEls[i].classList.add('on');
      gsap.fromTo(
        takeEls[i],
        { opacity: 0, scale: goingDown ? 1.04 : 0.94 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'power2.out' },
      );
      takeVideo(takeEls[prev])?.pause();
      void takeVideo(takeEls[i])?.play().catch(() => {});
      const n = takeEls[i].dataset.n ?? '';
      if (bignum) bignum.textContent = n;
      ambImgs.forEach((im, k) => im.classList.toggle('on', k === i));
      if (counter) counter.textContent = `${n} / ${total}`;
      if (fichaTxt) fichaTxt.textContent = takeEls[i].dataset.niche ?? '';
    }

    void takeVideo(takeEls[0])?.play().catch(() => {});

    ScrollTrigger.create({
      trigger: '#sessao',
      start: 'top top',
      end: '+=240%',
      pin: '#sessao .pinwrap',
      scrub: 0.5,
      onUpdate(self: { progress: number }) {
        if (progFill) progFill.style.width = `${self.progress * 100}%`;
        if (!takeEls.length) return;
        setTake(
          Math.min(
            takeEls.length - 1,
            Math.floor(self.progress * takeEls.length),
          ),
        );
      },
    });

    /* capítulos */
    document.querySelectorAll('#guiao h2, #fim h2').forEach((h) => {
      gsap.from(h, {
        y: 24,
        opacity: 0,
        duration: 0.45,
        ease: 'power2.out',
        scrollTrigger: { trigger: h, start: 'top 85%' },
      });
    });
    document.querySelectorAll('.chapHead').forEach((el) => {
      gsap.from(el.querySelector('i'), {
        scaleX: 0,
        transformOrigin: 'left',
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
      });
    });
    gsap.from('#fotosReel li', {
      x: 30,
      opacity: 0,
      duration: 0.7,
      stagger: 0.07,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#fotosReel', start: 'top 85%' },
    });
    gsap.from('#formatos .fmt li', {
      y: 18,
      opacity: 0,
      duration: 0.5,
      stagger: 0.07,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#formatos .fmt', start: 'top 88%' },
    });
    gsap.fromTo(
      '#guiao .plan',
      { y: 30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.7,
        stagger: 0.1,
        ease: 'power2.out',
        clearProps: 'transform',
        scrollTrigger: {
          trigger: '#guiao .planGrid',
          start: 'top 82%',
          once: true,
        },
      },
    );

    /* timeline do processo */
    gsap.to('.tline .fill', {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: '.tline',
        start: 'top 62%',
        end: 'bottom 72%',
        scrub: 0.4,
      },
    });
    document.querySelectorAll<HTMLElement>('.tsteps li').forEach((li) => {
      ScrollTrigger.create({
        trigger: li,
        start: 'top 66%',
        onEnter: () => li.classList.add('on'),
        onLeaveBack: () => li.classList.remove('on'),
      });
    });

    /* rodapé */
    gsap.from('#fim .fimShot', {
      y: 40,
      opacity: 0,
      duration: 0.7,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#fim .fimShot', start: 'top 85%' },
    });
    gsap.fromTo(
      '#fim .fimShot img',
      { scale: 1.1 },
      {
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '#fim',
          start: 'top bottom',
          end: 'bottom bottom',
          scrub: 0.6,
        },
      },
    );

    /* parallax dos fundos */
    document.querySelectorAll<HTMLElement>('.bgimg[data-par]').forEach((bx) => {
      const im = bx.querySelectorAll('img, video');
      if (!im.length) return;
      gsap.fromTo(
        im,
        { yPercent: -5 },
        {
          yPercent: 5,
          ease: 'none',
          scrollTrigger: {
            trigger: bx.parentElement,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
          },
        },
      );
    });

    /* chip flutuante */
    const chip = document.getElementById('chip');
    const meet = document.getElementById('meet');
    const fim = document.getElementById('fim');
    function updChip() {
      if (!chip || !meet || !fim) return;
      const top = meet.getBoundingClientRect().top;
      const end = fim.getBoundingClientRect().top;
      chip.classList.toggle(
        'on',
        top < window.innerHeight * 0.5 && end > window.innerHeight * 0.65,
      );
    }
    updChip();
    window.addEventListener('scroll', updChip, { passive: true });

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('scroll', updBg);
      window.removeEventListener('resize', updBg);
      window.removeEventListener('scroll', updChip);
      window.removeEventListener('load', onLoad);
    };
  });

  return () => ctx.revert();
}
