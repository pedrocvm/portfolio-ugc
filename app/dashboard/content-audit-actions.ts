'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  createTestFromRecommendation,
  evidenceFor,
  respondToRecommendation,
  runContentAudit,
  type EvidencePack,
} from '@/modules/content-brain/audit-service';
import { attachMedia, concludeExperiment, createExperiment } from '@/modules/content-brain/experiment-service';
import { isAuditPeriod, type AuditPeriod, type Evidence } from '@/modules/content-brain/audit';

/** As ações da Auditoria.
 *
 *  Finas de propósito: autenticar, chamar o serviço, revalidar. A regra vive no
 *  domínio — se estivesse aqui, a ferramenta da Carol AI teria de a repetir.
 *
 *  Nenhuma destas sai para fora. A Auditoria lê, conclui e prepara um teste;
 *  publicar continua a não existir. */

export type Result = { ok: true } | { error: string };
export type ResultWith<T> = ({ ok: true } & T) | { error: string };

const refresh = () => {
  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard');
};

/** «Criar teste» a partir de uma recomendação: a hipótese já vem preenchida. */
export async function createTestFrom(
  recommendationId: string,
  overrides?: { label?: string; hypothesis?: string; variable?: string; control?: string; variant?: string; primaryMetric?: string },
): Promise<ResultWith<{ experimentId: string }>> {
  await requireUser();
  const r = await createTestFromRecommendation(recommendationId, { overrides });
  if ('error' in r) return r;
  refresh();
  return { ok: true, experimentId: r.experimentId };
}

/** «Criar variação»: o teste nasce do conteúdo que serviu de referência, com
 *  uma variável mudada — nunca um clone do vídeo inteiro. */
export async function createVariation(input: {
  referenceMediaId: string;
  label: string;
  hypothesis: string;
  variable: string;
  keep: string;
  change: string;
  primaryMetric?: string;
}): Promise<ResultWith<{ experimentId: string }>> {
  await requireUser();
  const criado = await createExperiment({
    label: input.label,
    hypothesis: input.hypothesis,
    variable: input.variable,
    controlLabel: input.keep,
    variantLabel: input.change,
    primaryMetric: input.primaryMetric,
    origin: 'carol',
  });
  if ('error' in criado) return criado;

  // A peça de referência é o controlo. É o que torna a variação comparável
  // com alguma coisa em vez de nascer sozinha.
  const ligada = await attachMedia({ experimentId: criado.id, mediaId: input.referenceMediaId, arm: 'control' });
  if ('error' in ligada) return ligada;

  refresh();
  return { ok: true, experimentId: criado.id };
}

export async function respondToRecommendationAction(
  id: string,
  response: 'dismiss' | 'not_useful' | 'useful',
): Promise<Result> {
  await requireUser();
  const r = await respondToRecommendation({ id, response });
  if ('error' in r) return r;
  refresh();
  return { ok: true };
}

/** «Ver evidências»: as peças, aprendizados e testes que sustentam a frase. */
export async function loadEvidence(input: {
  statement: string;
  because?: string;
  sample?: string;
  evidence: Evidence;
}): Promise<ResultWith<{ pack: EvidencePack }>> {
  await requireUser();
  const pack = await evidenceFor(input);
  return { ok: true, pack };
}

export async function linkMediaToExperiment(input: {
  experimentId: string;
  mediaId: string;
  arm: 'control' | 'variant';
}): Promise<Result> {
  await requireUser();
  const r = await attachMedia(input);
  if ('error' in r) return r;
  refresh();
  return { ok: true };
}

/** Fechar um teste é decisão dela, como fechar e perder uma oportunidade. */
export async function concludeTest(input: { id: string; learning: string; pause?: boolean }): Promise<Result> {
  await requireUser();
  const r = await concludeExperiment({ id: input.id, learning: input.learning, status: input.pause ? 'paused' : 'learned' });
  if ('error' in r) return r;
  refresh();
  return { ok: true };
}

/** Correr a auditoria à mão. O horário faz isto de madrugada; o botão existe
 *  para quando ela quer ver agora, e não para a tela depender dele. */
export async function refreshAudit(period?: AuditPeriod): Promise<ResultWith<{ conclusions: number }>> {
  await requireUser();
  const r = await runContentAudit({ period: isAuditPeriod(period) ? period : '30d' });
  refresh();
  return r.status === 'failed'
    ? { error: r.failures[0] ?? 'Não consegui fechar a auditoria agora.' }
    : { ok: true, conclusions: r.conclusions };
}
