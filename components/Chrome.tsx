import { WHATSAPP } from '@/lib/site';

export default function Chrome() {
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
        href={WHATSAPP}
        target="_blank"
        rel="noopener"
      >
        Pedir vídeo →
      </a>
    </>
  );
}
