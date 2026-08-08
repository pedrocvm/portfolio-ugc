function Line({
  word,
  offset,
  className,
}: {
  word: string;
  offset: number;
  className?: string;
}) {
  return (
    <span className="logoLine">
      <span className={className}>
        {[...word].map((c, i) => (
          <span
            className="ch"
            key={i}
            style={{ '--i': i + offset } as React.CSSProperties}
          >
            {c}
          </span>
        ))}
      </span>
      <i className="nib" aria-hidden="true" />
    </span>
  );
}

/** O mesmo traço do hero: a mesma fonte, a mesma escrita letra a letra e a
 *  mesma pena a passar por cima. */
export default function Logo({ first, last }: { first: string; last: string }) {
  return (
    <span className="logoName" aria-label={`${first} ${last}`} role="img">
      <Line word={first} offset={0} />
      <Line word={last} offset={first.length} className="l2" />
    </span>
  );
}
