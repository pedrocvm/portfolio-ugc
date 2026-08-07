'use client';

import { useState } from 'react';
import { FAQ } from '@/lib/site';

export default function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="chap" aria-label="Perguntas frequentes">
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">05</span>
          <span className="mono eyebrow">FAQ</span>
          <i />
        </div>
        <div className="chapGrid split">
          <h2 className="disp">
            Antes de <em className="serif-it">perguntares.</em>
          </h2>
          <div className="faq">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button
                  className="q"
                  type="button"
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {q}
                  <span className="chev">+</span>
                </button>
                <div
                  className="a"
                  style={{ maxHeight: open === i ? '18rem' : 0 }}
                >
                  <p>{a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
