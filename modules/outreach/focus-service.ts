import 'server-only';

import { hasServiceRole, supabaseService } from '@/lib/supabase/service';
import { DEFAULT_FOCUS, normalizeFocus, type Focus } from './focus';

/** Lê e grava o foco. Puro está em `focus.ts`; aqui só há base de dados. */

/** Sem chave de serviço, o foco por omissão em vez de uma exceção.
 *
 *  Ler o foco é a primeira coisa que a tela de Prospeção faz, e a exceção
 *  levava a tela inteira ao error boundary — a busca dirigida, o histórico e os
 *  resultados desapareciam todos por causa de uma variável de ambiente que só
 *  a escrita precisa. Ler falha em silêncio e mostra o que se sabe; gravar
 *  continua exigindo a chave, e diz porquê. */
export async function readFocus(): Promise<Focus> {
  if (!hasServiceRole()) return DEFAULT_FOCUS;
  const db = supabaseService();
  const { data } = await db
    .from('outreach_focus')
    .select('niches, countries, per_day')
    .limit(1)
    .maybeSingle();

  if (!data) return DEFAULT_FOCUS;
  return normalizeFocus({
    niches: (data.niches ?? []) as Focus['niches'],
    countries: (data.countries ?? []) as string[],
    perDay: data.per_day,
  });
}

export async function writeFocus(input: Partial<Focus>): Promise<Focus> {
  if (!hasServiceRole()) throw new Error('sem_chave_de_servico');
  const db = supabaseService();
  const focus = normalizeFocus(input);

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) throw new Error('sem_usuario');

  const { error } = await db.from('outreach_focus').upsert(
    {
      app_user_id: me.id,
      niches: focus.niches as never,
      countries: focus.countries as never,
      per_day: focus.perDay,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'app_user_id' },
  );
  if (error) throw new Error('nao_guardou_foco');
  return focus;
}
