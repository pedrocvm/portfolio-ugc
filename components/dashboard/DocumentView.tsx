import type { Author, Rendered } from '@/lib/documents';
import Signature from './Signature';

export default function DocumentView({
  doc,
  author,
}: {
  doc: Rendered;
  author: Author;
}) {
  return (
    <article className="doc">
      <i className="docFita" aria-hidden="true" />

      <header className="docTopo">
        <span className="docMarca">
          <span className="docNome">{author.name}</span>
          <span className="mono docPapel">{author.role}</span>
        </span>
        {doc.subheading ? (
          <span className="mono docRef">{doc.subheading}</span>
        ) : null}
      </header>

      <h2 className="disp docTitulo">{doc.heading}</h2>

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
                <span className="docLabel">{b.label}</span>
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
                {i === 0 ? <Signature /> : null}
                <span className="rule" />
                {quem ? <span className="docWho">{quem}</span> : null}
              </div>
            ))}
          </div>
        </footer>
      ) : null}

      <p className="mono docPe" aria-hidden="true">
        <span>{author.name}</span>
        <span>{author.contact}</span>
      </p>
    </article>
  );
}
