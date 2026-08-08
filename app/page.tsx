import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Meet from '@/components/Meet';
import Session from '@/components/Session';
import Formats from '@/components/Formats';
import Photos from '@/components/Photos';
import Process from '@/components/Process';
import Plans from '@/components/Plans';
import Faq from '@/components/Faq';
import SiteFooter from '@/components/SiteFooter';
import ToTop from '@/components/ToTop';
import Chrome from '@/components/Chrome';
import Particles from '@/components/Particles';
import Motion from '@/components/Motion';

export default function Page() {
  return (
    <>
      <Chrome />
      <Particles />
      <Nav />
      <ToTop />
      <Hero />
      <Meet />
      <Session />
      <main id="guiao" className="scene on-light" data-bg="#f7f3ee" data-mode="light">
        <div className="bgimg" data-par="" data-src="1" aria-hidden="true">
          <img alt="" />
          <i className="ov" />
        </div>
        <Formats />
        <Photos />
        <Process />
        <Plans />
        <Faq />
      </main>
      <SiteFooter />
      <Motion />
    </>
  );
}
