/** Modo Sessão: agrupar o que dá para gravar de uma vez.
 *
 *  O custo que mais adia uma gravação é começar — montar, vestir, arrumar a
 *  luz, sair de casa. Se três peças partilham cenário e tipo de fala, são uma
 *  tarde, não três.
 *
 *  Isto não é uma agenda de produção. É uma lista com ordem e o que precisa
 *  estar pronto antes. Não há datas, não há duração estimada, não há
 *  dependências entre pessoas: nada disso existe na vida dela.
 *
 *  Puro. */

import { PILLAR_SHORT, type Pillar } from './editorial';
import type { PackKind } from './pack';

export type SessionItem = {
  proposalId: string;
  title: string;
  pillar: Pillar;
  packKind: PackKind | null;
  /** Precisa de gravação de tela. Muda o setup inteiro. */
  screenRecording: boolean;
  /** Fala à câmera, narração, ou nenhuma. */
  speech: 'to_camera' | 'voice_over' | 'none';
  needsOuting: boolean;
  /** Assets que têm de existir antes de ela começar. */
  assets: string[];
};

export type SessionGroup = {
  key: string;
  label: string;
  /** O que torna estas peças compatíveis. Sai para a tela como está. */
  shared: string[];
  needsOuting: boolean;
  items: SessionItem[];
  /** Ordem de gravação e o que preparar. Uma linha por passo. */
  checklist: string[];
};

/** Fora de casa nunca se mistura com dentro de casa, e gravação de tela nunca
 *  se mistura com o que não a tem: são setups diferentes. O resto agrupa. */
const keyFor = (i: SessionItem) =>
  [
    i.needsOuting ? 'fora' : 'casa',
    i.screenRecording ? 'tela' : 'sem_tela',
    i.speech,
  ].join(':');

const SPEECH_LABEL: Record<SessionItem['speech'], string> = {
  to_camera: 'falando para a câmera',
  voice_over: 'narração por cima',
  none: 'sem fala',
};

/** Agrupa. Uma peça sozinha não forma sessão — sessão de uma é só gravar. */
export function sessionGroups(items: readonly SessionItem[]): SessionGroup[] {
  const buckets = new Map<string, SessionItem[]>();
  for (const i of items) {
    const k = keyFor(i);
    buckets.set(k, [...(buckets.get(k) ?? []), i]);
  }

  return [...buckets.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => {
      const first = list[0];
      const shared = [
        first.needsOuting ? 'fora de casa' : 'em casa',
        SPEECH_LABEL[first.speech],
        ...(first.screenRecording ? ['gravação de tela'] : []),
        ...(new Set(list.map((i) => PILLAR_SHORT[i.pillar])).size === 1
          ? [PILLAR_SHORT[first.pillar]]
          : []),
      ];
      return {
        key,
        label: first.needsOuting
          ? `Sair uma vez: ${list.length} peças`
          : `Uma montagem só: ${list.length} peças`,
        shared,
        needsOuting: first.needsOuting,
        items: list,
        checklist: checklist(list),
      };
    })
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
}

/** A lista operacional. Assets primeiro — é o que trava a meio —, depois a
 *  ordem de gravação. */
function checklist(items: readonly SessionItem[]): string[] {
  const assets = [...new Set(items.flatMap((i) => i.assets))];
  const out: string[] = [];
  if (assets.length) out.push(...assets.map((a) => `Antes de começar: ${a}`));
  if (items.some((i) => i.screenRecording)) {
    out.push('Antes de começar: as gravações de tela, todas de uma vez');
  }
  // Sem número no texto: quem numera é o `<ol>` da tela.
  for (const i of items) out.push(i.title);
  if (items.length > 1) out.push('B-roll partilhado: grave uma vez e reaproveite');
  return out;
}

/** As peças que sobraram: não formaram grupo, e isso não é problema. */
export const loneItems = (items: readonly SessionItem[], groups: readonly SessionGroup[]): SessionItem[] => {
  const agrupadas = new Set(groups.flatMap((g) => g.items.map((i) => i.proposalId)));
  return items.filter((i) => !agrupadas.has(i.proposalId));
};
