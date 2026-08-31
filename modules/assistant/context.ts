import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';

/** A tela onde ela está.
 *
 *  O browser manda o tipo e o id, nunca o conteúdo: um nome de marca vindo do
 *  cliente é texto que alguém pode ter mudado. O servidor volta a resolvê-lo,
 *  e se o id não existir o contexto simplesmente não existe. */
export async function resolveEntity(
  entity: { type: string; id: string | null } | null,
): Promise<{ type: string; label: string; id: string } | null> {
  if (!entity?.id) return null;
  const db = await supabaseServer();

  switch (entity.type) {
    case 'brand': {
      const { data } = await db.from('brand').select('name').eq('id', entity.id).maybeSingle();
      return data ? { type: 'marca', label: data.name, id: entity.id } : null;
    }
    case 'opportunity': {
      const { data } = await db
        .from('opportunity')
        .select('title, brand:brand_id ( name )')
        .eq('id', entity.id)
        .maybeSingle();
      if (!data) return null;
      const b = data.brand as { name: string } | null;
      return { type: 'oportunidade', label: b?.name ?? data.title ?? 'oportunidade', id: entity.id };
    }
    case 'document': {
      const { data } = await db.from('document').select('title, kind').eq('id', entity.id).maybeSingle();
      return data ? { type: 'documento', label: data.title || data.kind, id: entity.id } : null;
    }
    case 'collaboration': {
      const { data } = await db
        .from('collaboration')
        .select('brand:brand_id ( name )')
        .eq('id', entity.id)
        .maybeSingle();
      if (!data) return null;
      const b = data.brand as { name: string } | null;
      return { type: 'produção', label: b?.name ?? 'colaboração', id: entity.id };
    }
    case 'content': {
      const { data } = await db.from('content_asset').select('title').eq('id', entity.id).maybeSingle();
      return data ? { type: 'conteúdo', label: data.title || 'conteúdo', id: entity.id } : null;
    }
    default:
      return null;
  }
}

/** Os atalhos que aparecem ao abrir o chat. Só arrancam uma mensagem — não há
 *  comportamento especial por trás deles, senão passavam a ser um segundo
 *  produto a manter. */
export function suggestionsFor(type: string | null): string[] {
  switch (type) {
    case 'brand':
      return ['Resume esta marca', 'O que faço agora?', 'Vale a pena insistir?', 'Escreve o follow-up'];
    case 'opportunity':
      return ['Analisa a negociação', 'Quanto devo cobrar?', 'Que informação ainda falta?', 'O que respondo?'];
    case 'collaboration':
    case 'content':
      return ['Resume o briefing', 'O que falta gravar?', 'Monta o shot list'];
    case 'document':
      return ['Resume este documento', 'Que riscos tem?'];
    default:
      return [
        'O que precisa da minha atenção?',
        'Quem devo cobrar hoje?',
        'Que marcas estão paradas?',
        'Quais podem virar clientes pagos?',
      ];
  }
}
