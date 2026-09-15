import type { Metadata } from 'next';
import DegradedNotice from '@/components/DegradedNotice';
import LinkTree from '@/components/links/LinkTree';
import { wa } from '@/lib/content';
import { getPublishedMeta, getPublishedOrDefault } from '@/lib/content-store';
import '../site.css';
import './links.css';

export async function generateMetadata(): Promise<Metadata> {
  const { hero, meta } = await getPublishedMeta();
  const nome = `${hero.firstName} ${hero.lastName}`;
  return {
    title: `${nome} — Links`,
    description: meta.description,
    openGraph: {
      title: nome,
      description: meta.ogDescription,
      locale: 'pt_BR',
      type: 'profile',
      images: [meta.ogImage],
    },
  };
}

export default async function ContactoPage() {
  const { content: c, degraded } = await getPublishedOrDefault();
  return (
    <>
      {degraded ? <DegradedNotice /> : null}
      <LinkTree
        c={c.links}
        hero={c.hero}
        contact={c.contact}
        whatsapp={wa(c.contact.phone, c.contact.whatsappMessage)}
      />
    </>
  );
}
