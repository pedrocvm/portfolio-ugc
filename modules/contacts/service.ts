import 'server-only';

import type { Db } from '@/modules/activity/service';

/** Guardar um contato sem partir no `ON CONFLICT`.
 *
 *  Três sítios escreviam contatos com `upsert(..., { onConflict: 'email' })` e
 *  os três falhavam sempre. A restrição que existe na base é
 *  `unique (lower(email)) where email is not null` — um índice sobre uma
 *  expressão, não sobre a coluna. O Postgres não infere um do outro, e devolve
 *  «there is no unique or exclusion constraint matching the ON CONFLICT
 *  specification».
 *
 *  Ninguém deu por isso porque o erro era ignorado: `const { data } = await …`
 *  deixava `contactId` a nulo e o processamento seguia. A prova está na base —
 *  onze contatos, todos do painel antigo, e zero eventos `contact.discovered`.
 *
 *  Procurar antes de escrever é o que funciona com o índice que existe, e não
 *  precisa de migração. O email é único em toda a tabela, não por marca: se já
 *  existir noutra marca, é esse o contato que se devolve — é a caixa da mesma
 *  pessoa, e a base não deixa haver duas. */
export type ContactInput = {
  brandId: string;
  email: string;
  name?: string | null;
  role?: string | null;
  preferredChannel?: 'email' | 'instagram' | 'whatsapp' | 'call' | 'other';
  source?: string | null;
};

export async function upsertContactByEmail(
  db: Db,
  input: ContactInput,
): Promise<{ id: string } | { error: string }> {
  const email = input.email.trim();
  if (!email) return { error: 'Sem endereço.' };

  const { data: existente, error: erroBusca } = await db
    .from('contact')
    .select('id, name, role')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (erroBusca) return { error: erroBusca.message };

  if (existente) {
    // Só se preenche o que estava vazio. Um nome vindo de uma assinatura de
    // email não apaga o que ela escreveu à mão.
    const patch = {
      ...(!existente.name && input.name ? { name: input.name } : {}),
      ...(!existente.role && input.role ? { role: input.role } : {}),
    };
    if (Object.keys(patch).length) await db.from('contact').update(patch).eq('id', existente.id);
    return { id: existente.id };
  }

  const { data, error } = await db
    .from('contact')
    .insert({
      brand_id: input.brandId,
      email,
      name: input.name ?? '',
      role: input.role ?? '',
      ...(input.preferredChannel ? { preferred_channel: input.preferredChannel } : {}),
      ...(input.source ? { source: input.source } : {}),
    })
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'A escrita do contato não devolveu nada.' };
  return { id: data.id };
}
