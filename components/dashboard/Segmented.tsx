'use client';

import { useEffect, useRef, useState } from 'react';

/** Controlo segmentado com marcador que desliza para a opção escolhida. O
 *  marcador é medido do próprio botão, por isso aguenta rótulos de qualquer
 *  largura sem contas mágicas. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const move = () => {
      const on = el.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (on) setThumb({ x: on.offsetLeft, w: on.offsetWidth });
    };
    move();
    const ro = new ResizeObserver(move);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div className="seg" role="group" aria-label={label} ref={box}>
      {thumb ? (
        <span
          className="segThumb"
          aria-hidden="true"
          style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
        />
      ) : null}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
