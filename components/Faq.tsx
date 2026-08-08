'use client';

import { useState } from 'react';
import type { Content } from '@/lib/content';

export default function Faq({ c }: { c: Content['faq'] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="chap" aria-label="Perguntas frequentes">
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">{c.num}</span>
          <span className="mono eyebrow">{c.eyebrow}</span>
          <i />
        </div>
        <div className="chapGrid split">
          <h2 className="disp">
            {c.titleLead} <em className="serif-it">{c.titleEm}</em>
          </h2>
          <div className="faq">
            {c.items.map((it, i) => (
              <div key={i}>
                <button
                  className="q"
                  type="button"
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {it.q}
                  <span className="chev">+</span>
                </button>
                <div
                  className="a"
                  style={{ maxHeight: open === i ? '18rem' : 0 }}
                >
                  <p>{it.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
