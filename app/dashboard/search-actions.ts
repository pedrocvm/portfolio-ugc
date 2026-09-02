'use server';

import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

/** A busca que atravessa tudo.
 *
 *  As Marcas, os Clientes e os Documentos saíram do primeiro nível do menu
 *  porque são base de conhecimento: consultam-se quando alguém pergunta, não
 *  todos os dias. Isso só funciona se houver forma de lá chegar sem navegar —
 *  é isto.
 *
 *  Cinco leituras pequenas em paralelo, com limite baixo cada uma. Não é
 *  pesquisa semântica: é `ilike` sobre os nomes, que é o que responde a «onde
 *  é que está a Cecotec» em vinte milissegundos. */

export type Hit = {
  id: string;
  label: string;
  detail: string;
  group: string;
  href: string;
};

const POR_TIPO = 4;

export async function searchEverything(query: string): Promise<Hit[]> {
  await requireUser();
  const q = query.trim();
  // Duas letras é o mínimo para não devolver o CRM inteiro à primeira tecla.
  if (q.length < 2) return [];

  const db = await supabaseServer();
  const like = `%${q}%`;

  const [marcas, contatos, oportunidades, documentos, conteudo] = await Promise.all([
    db.from('brand').select('id, name, category_primary').ilike('name', like).limit(POR_TIPO),
    db.from('contact').select('id, name, email, brand_id, brand:brand_id ( name )')
      .or(`name.ilike.${like},email.ilike.${like}`).limit(POR_TIPO),
    db.from('opportunity').select('id, product_name, stage, brand:brand_id ( name )')
      .ilike('product_name', like).limit(POR_TIPO),
    db.from('document').select('id, title, kind').ilike('title', like).limit(POR_TIPO),
    db.from('content_asset').select('id, title').ilike('title', like).limit(POR_TIPO),
  ]);

  const nome = (row: { brand?: { name: string } | null }) => row.brand?.name ?? '';

  return [
    ...(marcas.data ?? []).map((b) => ({
      id: `brand-${b.id}`,
      label: b.name,
      detail: b.category_primary ?? 'marca',
      group: 'Marcas',
      href: `/dashboard/brands/${b.id}`,
    })),
    ...((oportunidades.data ?? []) as unknown as
      { id: string; product_name: string; stage: string; brand: { name: string } | null }[]).map((o) => ({
      id: `opp-${o.id}`,
      label: `${nome(o)}${nome(o) ? ' — ' : ''}${o.product_name}`,
      detail: 'negócio',
      group: 'Negócios',
      href: `/dashboard/opportunities/${o.id}`,
    })),
    ...((contatos.data ?? []) as unknown as
      { id: string; name: string; email: string | null; brand_id: string | null; brand: { name: string } | null }[]).map(
      (c) => ({
        id: `contact-${c.id}`,
        label: c.name || c.email || 'contato',
        detail: nome(c) || c.email || 'contato',
        group: 'Pessoas',
        href: c.brand_id ? `/dashboard/brands/${c.brand_id}` : '/dashboard/clients',
      }),
    ),
    ...(documentos.data ?? []).map((d) => ({
      id: `doc-${d.id}`,
      label: d.title,
      detail: d.kind ?? 'documento',
      group: 'Documentos',
      href: `/dashboard/documents`,
    })),
    ...(conteudo.data ?? []).map((c) => ({
      id: `content-${c.id}`,
      label: c.title,
      detail: 'peça de conteúdo',
      group: 'Conteúdo',
      href: '/dashboard/content',
    })),
  ];
}
