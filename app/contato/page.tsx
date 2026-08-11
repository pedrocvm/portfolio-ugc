import type { Metadata } from 'next';
import LinkTree from '@/components/links/LinkTree';
import { wa } from '@/lib/content';
import { getPublished } from '@/lib/content-store';
import './links.css';

export async function generateMetadata(): Promise<Metadata> {
  const { hero, meta } = await getPublished();
  const nome = `${hero.firstName} ${hero.lastName}`;
  return {
    title: `${nome} — Ligações`,
    description: meta.description,
    openGraph: {
      title: nome,
      description: meta.ogDescription,
      locale: 'pt_PT',
      type: 'profile',
      images: [meta.ogImage],
    },
  };
}

export default async function ContactoPage() {
  const c = await getPublished();
  return (
    <LinkTree
      c={c.links}
      hero={c.hero}
      contact={c.contact}
      whatsapp={wa(c.contact.phone, c.contact.whatsappMessage)}
    />
  );
}
