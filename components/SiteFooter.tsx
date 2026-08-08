import type { Content } from '@/lib/content';
import Pic from './Pic';

export default function SiteFooter({
  c,
  contact,
  whatsapp,
}: {
  c: Content['footer'];
  contact: Content['contact'];
  whatsapp: string;
}) {
  return (
    <footer
      id="fim"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
    >
      <div className="wrap">
        <div className="fimGrid">
          <figure className="fimShot">
            <video
              data-src={c.video.src}
              data-src-sm={c.video.srcSm || c.video.src}
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              tabIndex={-1}
            />
            <Pic src={c.image} alt={c.imageAlt} />
            <figcaption className="mono">
              {c.caption}
              <i />
              {c.captionSub}
            </figcaption>
          </figure>
          <div>
            <p className="mono ey">{c.eyebrow}</p>
            <h2 className="disp">
              {c.titleLead} <em className="script">{c.titleEm}</em>
            </h2>
            <p className="lead">{c.lead}</p>
            <a
              className="cta-btn"
              href={whatsapp}
              target="_blank"
              rel="noopener"
            >
              {c.cta}
            </a>
            <p className="ig">
              {c.igPrefix}{' '}
              <a href={contact.instagram} target="_blank" rel="noopener">
                {contact.instagramHandle}
              </a>
            </p>
          </div>
        </div>
        <div className="fimBar mono">
          <span>{c.barLeft}</span>
          <span>{c.barRight}</span>
        </div>
      </div>
    </footer>
  );
}
