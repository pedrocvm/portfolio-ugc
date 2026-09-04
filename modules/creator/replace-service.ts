import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { type RejectionReason, type Platform } from './domain';
import { directedIdea, type Track } from './plan-service';

/** «Quero outra ideia.»
 *
 *  Não é regenerar às cegas — isso devolvia a mesma coisa com outras palavras.
 *  Recebe uma direção de um toque e escreve outra na mesma plataforma, sabendo
 *  o que já foi sugerido para não repetir.
 *
 *  A ideia velha é descartada com o motivo. Fica no banco: se ela mudar de
 *  ideias, o que foi recusado ainda existe.
 *
 *  O caminho de gravação é o mesmo do plano do dia (`directedIdea` →
 *  `saveIdea`): os mesmos portões, a mesma função e modo, os mesmos ganchos.
 *  Era uma cópia de sessenta linhas, e uma cópia é onde uma regra nova fica
 *  por aplicar. */

/** O que se pede a seguir, motivo a motivo.
 *
 *  Uma vocabulário só: o botão que ela toca para recusar é o mesmo que dirige
 *  a alternativa. Duas listas paralelas — «recusei porque» e «quero mais» —
 *  era pedir-lhe para dizer a mesma coisa duas vezes. */
const REASON_BRIEF: Record<RejectionReason, string> = {
  off_profile:
    'A ANTERIOR NÃO ERA DELA. Fica no território dela: comunicação, cliente, marca, o dia de quem grava. Se qualquer perfil podia ter publicado isto, está errado.',
  teaching:
    'A ANTERIOR ESTAVA DANDO AULA. Menos ensinar, mais contar: uma cena concreta que aconteceu, com o que ela sentiu e o que correu mal.',
  too_hard:
    'A ANTERIOR DAVA TRABALHO DEMAIS. Menos tomadas, menos adereços, menos edição. Se der para gravar num take só, melhor.',
  seen_it:
    'A ANTERIOR JÁ ESTÁ EM TODO LUGAR. Procura o ângulo que ninguém usa, mesmo que o formato seja conhecido.',
  wrong_moment:
    'A ANTERIOR ESTAVA PRESA A ESTA SEMANA. Escolhe algo que continue certo daqui a um mês.',
};

export type ReplaceResult = { ok: true; id: string } | { ok: false; error: string };

export async function replaceIdea(ideaId: string, motivo?: RejectionReason): Promise<ReplaceResult> {
  const db = supabaseService();

  const { data: old } = await db
    .from('creator_content_idea')
    .select('id, platform, hook, track')
    .eq('id', ideaId)
    .maybeSingle();

  if (!old) return { ok: false, error: 'Ideia não encontrada.' };

  const track = (old.track as Track) ?? 'main';
  const result = await directedIdea({
    directive: `${REASON_BRIEF[motivo ?? 'off_profile']} A recusada agora foi: «${old.hook}». Não voltes a ela.`,
    platform: old.platform as Platform,
    track: track === 'reels_test' ? 'reels_test' : 'main',
    entityId: ideaId,
  });

  if (!result.ok) return { ok: false, error: `A alternativa não era melhor: ${result.because}.` };

  await db
    .from('creator_content_idea')
    .update({
      status: 'discarded',
      decided_at: new Date().toISOString(),
      rejected_reason: motivo ?? 'off_profile',
    })
    .eq('id', ideaId);

  return { ok: true, id: result.id };
}
