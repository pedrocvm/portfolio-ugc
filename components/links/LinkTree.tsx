'use client';

import { useEffect, useRef } from 'react';
import Particles from '@/components/Particles';
import Pic from '@/components/Pic';
import type { Content } from '@/lib/content';
import { track } from '@/lib/track';

type Props = {
  c: Content['links'];
  hero: Content['hero'];
  contact: Content['contact'];
  whatsapp: string;
};

const externo = (href: string) => /^https?:\/\//i.test(href);

function Letras({ palavra, salto }: { palavra: string; salto: number }) {
  return (
    <>
      {[...palavra].map((c, i) => (
        <span
          className="ch"
          key={i}
          aria-hidden="true"
          style={{ '--i': i + salto } as React.CSSProperties}
        >
          {c}
        </span>
      ))}
    </>
  );
}

export default function LinkTree({ c, hero, contact, whatsapp }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const contado = useRef(false);

  /* a visita conta-se uma vez por carregamento. o guarda existe porque em
     desenvolvimento o React monta duas vezes de propósito */
  useEffect(() => {
    if (contado.current) return;
    contado.current = true;
    track('view');
  }, []);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.dataset.pronto = '';
    if (parado) return;

    let limpar = () => {};
    let cancelado = false;

    (async () => {
      const [{ gsap }, lottie, halos, setas] = await Promise.all([
        import('gsap'),
        import('lottie-web/build/player/lottie_light'),
        fetch('/lottie/halo.json').then((r) => r.json()),
        fetch('/lottie/seta.json').then((r) => r.json()),
      ]);
      if (cancelado) return;

      const player = lottie.default;
      const animacoes = [
        halo.current &&
          player.loadAnimation({
            container: halo.current,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: halos,
          }),
        ...Array.from(el.querySelectorAll<HTMLElement>('.lkSeta')).map((caixa) => {
          const a = player.loadAnimation({
            container: caixa,
            renderer: 'svg',
            loop: false,
            autoplay: false,
            animationData: setas,
          });
          const cartao = caixa.closest<HTMLElement>('.lkItem');
          const tocar = () => a.goToAndPlay(0, true);
          cartao?.addEventListener('pointerenter', tocar);
          cartao?.addEventListener('focus', tocar);
          return Object.assign(a, {
            soltar: () => {
              cartao?.removeEventListener('pointerenter', tocar);
              cartao?.removeEventListener('focus', tocar);
            },
          });
        }),
      ].filter(Boolean);

      const ctx = gsap.context(() => {
        /* o foco de luz segue o ponteiro. quickTo escreve na propriedade sem
           criar um tween por evento, que a 120Hz seria lixo a mais */
        const luzX = gsap.quickTo(el, '--lx', { duration: 0.9, ease: 'power3' });
        const luzY = gsap.quickTo(el, '--ly', { duration: 0.9, ease: 'power3' });
        function seguir(e: PointerEvent) {
          luzX((e.clientX / window.innerWidth) * 100);
          luzY((e.clientY / window.innerHeight) * 100);
        }
        window.addEventListener('pointermove', seguir, { passive: true });

        /* cada botão inclina-se para o lado onde o dedo está. o toque não
           inclina nada: no telemóvel o cartão só afunda ao ser premido */
        const cartoes = Array.from(el.querySelectorAll<HTMLElement>('.lkItem'));
        const soltar: (() => void)[] = [];
        for (const cartao of cartoes) {
          const rx = gsap.quickTo(cartao, 'rotationX', { duration: 0.5, ease: 'power3' });
          const ry = gsap.quickTo(cartao, 'rotationY', { duration: 0.5, ease: 'power3' });
          const bx = gsap.quickTo(cartao, '--bx', { duration: 0.4, ease: 'power3' });

          function mover(e: PointerEvent) {
            if (e.pointerType !== 'mouse') return;
            const r = cartao.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width;
            const py = (e.clientY - r.top) / r.height;
            rx(-(py - 0.5) * 9);
            ry((px - 0.5) * 13);
            bx(px * 100);
          }
          function sair() {
            rx(0);
            ry(0);
          }
          cartao.addEventListener('pointermove', mover, { passive: true });
          cartao.addEventListener('pointerleave', sair);
          soltar.push(() => {
            cartao.removeEventListener('pointermove', mover);
            cartao.removeEventListener('pointerleave', sair);
          });
        }

        limpar = () => {
          window.removeEventListener('pointermove', seguir);
          soltar.forEach((f) => f());
        };
      }, el);

      const anterior = limpar;
      limpar = () => {
        anterior();
        ctx.revert();
        for (const a of animacoes) {
          (a as { soltar?: () => void }).soltar?.();
          (a as { destroy: () => void }).destroy();
        }
      };
    })();

    return () => {
      cancelado = true;
      limpar();
    };
  }, []);

  async function partilhar() {
    track('share');
    const url = window.location.href;
    const titulo = `${hero.firstName} ${hero.lastName}`;
    if (navigator.share) {
      await navigator.share({ title: titulo, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    raiz.current?.setAttribute('data-copiado', '');
    setTimeout(() => raiz.current?.removeAttribute('data-copiado'), 2200);
  }

  return (
    <div className="lk" ref={raiz}>
      <div className="lkFundo" aria-hidden="true" />
      <div className="lkVeu" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <Particles />

      <main className="lkFolha">
        <header className="lkCabeca">
          <div className="lkRetratoBox">
            <div className="lkHalo" ref={halo} aria-hidden="true" />
            <div className="lkRetrato">
              <Pic src={c.avatar} alt={c.avatarAlt} eager />
            </div>
          </div>
          <p className="mono lkKicker">{hero.kicker}</p>
          <h1
            className="lkNome hl"
            style={{ '--n': hero.firstName.length } as React.CSSProperties}
          >
            <span className="line">
              <span className="l1" aria-label={hero.firstName}>
                <Letras palavra={hero.firstName} salto={0} />
              </span>
              <i className="nib" aria-hidden="true" />
            </span>
            <span className="line">
              <span className="l2" aria-label={hero.lastName}>
                <Letras palavra={hero.lastName} salto={hero.firstName.length} />
              </span>
              <i className="nib" aria-hidden="true" />
            </span>
          </h1>
          <i className="lkRisco" aria-hidden="true" />
        </header>

        <nav className="lkLista" aria-label="Links">
          {c.items
            .filter((l) => l.href && l.label)
            .map((l, i) => (
              <a
                className="lkItem"
                key={`${l.href}-${i}`}
                href={l.href}
                target={externo(l.href) ? '_blank' : undefined}
                rel={externo(l.href) ? 'noopener' : undefined}
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => track('click', l.label)}
              >
                <span className="lkBrilho" aria-hidden="true" />
                {l.image ? (
                  <span className="lkFoto" aria-hidden="true">
                    <Pic src={l.image} alt="" />
                  </span>
                ) : null}
                <span className="lkTexto">
                  <span className="lkRotulo">{l.label}</span>
                  {l.note ? <span className="lkNota">{l.note}</span> : null}
                </span>
                <span className="lkSeta" aria-hidden="true" />
              </a>
            ))}
        </nav>

        <footer className="lkFoot">
          <a
            className="lkContacto"
            href={whatsapp}
            target="_blank"
            rel="noopener"
            onClick={() => track('contact', 'whatsapp')}
          >
            WhatsApp
          </a>
          <a
            className="lkContacto"
            href={contact.instagram}
            target="_blank"
            rel="noopener"
            onClick={() => track('contact', 'instagram')}
          >
            {contact.instagramHandle}
          </a>
          <button className="lkContacto" type="button" onClick={partilhar}>
            Compartilhar
          </button>
          <p className="mono lkCopia" role="status">
            Link copiado
          </p>
        </footer>
      </main>
    </div>
  );
}
