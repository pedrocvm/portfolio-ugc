import type { Content } from '@/lib/content';

export default function Process({ c }: { c: Content['process'] }) {
  return (
    <section id="processo" className="chap band" aria-label="Como funciona">
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
          <div className="tline">
            <span className="rail" aria-hidden="true" />
            <span className="fill" aria-hidden="true" />
            <ol className="tsteps">
              {c.steps.map((s, i) => (
                <li key={i}>
                  <span className="node" aria-hidden="true" />
                  <span className="n mono">{s.n}</span>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
