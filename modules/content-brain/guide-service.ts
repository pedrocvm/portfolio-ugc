/** Onde fica o que a Carol já viu do guia.
 *
 *  Não nasce tabela nova: o CarolOS já tem `app_setting`, que é onde vivem as
 *  bandeiras e o modo de teste intensivo. A área privada tem uma operadora —
 *  uma linha por chave chega, e uma tabela de preferências por usuário seria
 *  esquema a mais para um estado de quatro campos.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import {
  CONTENT_BRAIN_GUIDE_VERSION,
  guidePatch,
  readGuideState,
  resumeGuideStep,
  shouldOfferFirstRun,
  type GuideState,
} from './guide';

const KEY = 'content_brain_guide';
const DESCRIPTION = 'Content Brain: versão do guia vista, posição, dispensa e conclusão';

export async function readGuide(): Promise<GuideState | null> {
  const db = await supabaseServer();
  const { data } = await db.from('app_setting').select('value').eq('key', KEY).maybeSingle();
  return readGuideState(data?.value);
}

export type GuideEntry = {
  offerFirstRun: boolean;
  resumeAt: number;
  version: number;
};

/** O que a tela de Conteúdo precisa saber antes de pintar o cabeçalho. */
export async function guideEntry(): Promise<GuideEntry> {
  // Uma falha de leitura não pode virar um convite: interromper quem já
  // dispensou é pior do que não convidar quem nunca viu. O botão «Como usar»
  // continua lá nos dois casos.
  const estado = await readGuide().catch(() => 'ilegivel' as const);
  if (estado === 'ilegivel') {
    return { offerFirstRun: false, resumeAt: 0, version: CONTENT_BRAIN_GUIDE_VERSION };
  }
  return {
    offerFirstRun: shouldOfferFirstRun(estado),
    resumeAt: resumeGuideStep(estado),
    version: CONTENT_BRAIN_GUIDE_VERSION,
  };
}

export async function writeGuide(input: {
  step?: number;
  dismissedAt?: string | null;
  completedAt?: string | null;
}): Promise<GuideState> {
  const db = await supabaseServer();
  const next = guidePatch({ current: await readGuide(), ...input });
  await db.from('app_setting').upsert({ key: KEY, value: asJson(next), description: DESCRIPTION });
  return next;
}
