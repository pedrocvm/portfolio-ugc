import { wa, type Content } from '@/lib/content';
import Nav from './Nav';
import Hero from './Hero';
import Meet from './Meet';
import Session from './Session';
import Photos from './Photos';
import Process from './Process';
import Plans from './Plans';
import Faq from './Faq';
import SiteFooter from './SiteFooter';
import ToTop from './ToTop';
import Chrome from './Chrome';
import Particles from './Particles';
import Motion from './Motion';

export default function Site({
  c,
  media,
}: {
  c: Content;
  media: Record<string, string[]>;
}) {
  const whatsapp = wa(c.contact.phone, c.contact.whatsappMessage);
  const pool = [
    ...c.session.takes.map((t) => t.img),
    ...c.photos.items.map((p) => p.src),
  ];

  return (
    <>
      <Chrome label={c.nav.chip} whatsapp={whatsapp} />
      <Particles />
      <Nav c={c.nav} whatsapp={whatsapp} />
      <ToTop />
      <Hero c={c.hero} />
      <Meet c={c.meet} pool={pool} media={media} />
      <Session c={c.session} />
      <main
        id="guiao"
        className="scene on-light"
        data-bg="#f7f3ee"
        data-mode="light"
      >
        <div className="bgimg" data-par="" data-src="1" aria-hidden="true">
          <img alt="" />
          <i className="ov" />
        </div>
        <Photos c={c.photos} />
        <Process c={c.process} />
        <Plans c={c.plans} phone={c.contact.phone} />
        <Faq c={c.faq} />
      </main>
      <SiteFooter c={c.footer} contact={c.contact} whatsapp={whatsapp} />
      <Motion />
    </>
  );
}
