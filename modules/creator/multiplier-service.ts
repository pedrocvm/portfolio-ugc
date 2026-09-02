import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { multiplyContent } from '@/modules/ai/prompts/registry';
import { describeProfile, readProfile } from './profile-service';
import { PILLAR_LABEL, isPillar } from './domain';

/** O Content Multiplier, e o motor de bastidores que vive dentro dele.
 *
 *  A Carol já vai gravar para uma marca: está em casa, com o produto na mão, a
 *  luz montada e o tripé de pé. A pergunta que ninguém faz é o que mais sai
 *  dessa mesma sessão — e a resposta certa raramente é «tudo o que é possível».
 *  São duas coisas, no máximo três, e nenhuma que acrescente duas horas.
 *
 *  Por isso `extraMinutes` não é decoração: é o critério. Uma sugestão que
 *  custa mais vinte minutos numa gravação de trinta não é multiplicar, é outro
 *  trabalho disfarçado. */

export type MultiplierSuggestion = {
  platform: 'instagram' | 'tiktok';
  angle: string;
  hook: string;
  extraEffort: string;
  extraMinutes: number;
  pillar: string;
  pillarLabel: string;
};

export type MultiplierResult =
  | { ok: true; suggestions: MultiplierSuggestion[]; brandName: string }
  | { ok: false; reason: string };

/** Acima disto já não é a mesma sessão: é outra gravação. */
const MAX_EXTRA_MINUTES = 15;

export async function multiplierFor(collaborationId: string): Promise<MultiplierResult> {
  const db = supabaseService();

  const { data: c } = await db
    .from('collaboration')
    .select('id, title, brand_id, brand:brand_id ( name ), product:product_id ( name )')
    .eq('id', collaborationId)
    .maybeSingle();

  if (!c) return { ok: false, reason: 'Gravação não encontrada.' };

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const brandName = one(c.brand as { name: string } | { name: string }[] | null)?.name ?? 'a marca';
  const product = one(c.product as { name: string } | { name: string }[] | null)?.name ?? '';

  const { data: pecas } = await db
    .from('content_asset')
    .select('title, hook, script, shot_list')
    .eq('collaboration_id', collaborationId)
    .limit(3);

  const guiao = (pecas ?? [])
    .map((p) => `${p.title}: ${p.hook}\n${(p.script ?? '').slice(0, 1200)}`)
    .join('\n\n');

  if (!guiao.trim()) {
    return {
      ok: false,
      reason: 'Ainda não há guião nesta gravação. Sem ele não dá para saber o que mais sai da mesma sessão.',
    };
  }

  const tomadas = (pecas ?? [])
    .flatMap((p) => ((p.shot_list ?? []) as { shot?: string }[]).map((s) => s.shot).filter(Boolean))
    .join('; ');

  const profile = await readProfile();

  const run = await runPrompt(
    multiplyContent,
    {
      brand: brandName,
      product,
      script: guiao,
      shots: tomadas || '(sem lista de tomadas)',
      profile: describeProfile(profile),
    },
    { entityType: 'collaboration', entityId: collaborationId, cache: true },
  );

  if (!run.ok) return { ok: false, reason: run.message };

  const suggestions = run.output.suggestions
    // A regra é o custo extra, e é aqui que se aplica — não numa frase do
    // prompt a pedir por favor.
    .filter((s) => s.extra_minutes <= MAX_EXTRA_MINUTES)
    .slice(0, 3)
    .map((s) => ({
      platform: s.platform,
      angle: s.angle,
      hook: s.hook,
      extraEffort: s.extra_effort,
      extraMinutes: s.extra_minutes,
      pillar: s.pillar,
      pillarLabel: isPillar(s.pillar) ? PILLAR_LABEL[s.pillar] : s.pillar,
    }));

  return { ok: true, suggestions, brandName };
}
