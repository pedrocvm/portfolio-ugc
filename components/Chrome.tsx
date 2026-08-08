export default function Chrome({
  label,
  whatsapp,
}: {
  label: string;
  whatsapp: string;
}) {
  return (
    <>
      <div id="bg" />
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="bar" id="barT" aria-hidden="true" />
      <div className="bar" id="barB" aria-hidden="true" />
      <a
        id="chip"
        className="mono"
        href={whatsapp}
        target="_blank"
        rel="noopener"
      >
        {label}
      </a>
    </>
  );
}
