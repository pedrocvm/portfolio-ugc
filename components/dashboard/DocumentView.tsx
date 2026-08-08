import type { Rendered } from '@/lib/documents';

export default function DocumentView({ doc }: { doc: Rendered }) {
  return (
    <article className="doc">
      <header className="docHead">
        <h2>{doc.heading}</h2>
        <p className="mono">{doc.subheading}</p>
      </header>
      {doc.sections.map((sec, i) => (
        <section className="docSec" key={i}>
          <h3>{sec.title}</h3>
          {sec.blocks.map((b, k) =>
            b.t === 'p' ? (
              <p key={k}>{b.text}</p>
            ) : b.t === 'list' ? (
              <ul key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            ) : (
              <p className="docPair" key={k}>
                <span className="mono">{b.label}</span>
                <span>{b.value}</span>
              </p>
            ),
          )}
        </section>
      ))}
      {doc.signature.length ? (
        <footer className="docSign">
          <p className="docPlace">{doc.signature[0]}</p>
          <div className="docSignRow">
            {doc.signature.slice(1).map((quem, i) => (
              <div key={i}>
                <span className="rule" />
                <span className="mono">{quem}</span>
              </div>
            ))}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
