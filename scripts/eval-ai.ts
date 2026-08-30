/** Avaliação da camada de IA contra o modelo real.
 *
 *  Fora do CI de propósito: chamar um modelo por commit é caro, lento e
 *  instável. Corre quando há uma mudança de prompt para julgar.
 *
 *      ANTHROPIC_API_KEY=... npm run eval:ai
 *
 *  O que mede não é «a resposta parece boa». Mede três coisas verificáveis:
 *  apanhou o que tinha de apanhar, não inventou o que não estava lá, e propôs
 *  uma ação dentro do aceitável. A segunda é a que interessa mais — um modelo
 *  que preenche um campo de dinheiro por sua conta é perigoso mesmo quando
 *  acerta no resto. */

import { extractCommercial } from '../modules/ai/prompts/registry.ts';
import { FIXTURES, type Fixture } from '../modules/ai/evals/fixtures.ts';
import { runPrompt } from '../modules/ai/gateway.ts';
import type { CommercialExtraction } from '../modules/ai/schemas.ts';

type Verdict = {
  id: string;
  ok: boolean;
  missed: string[];
  invented: string[];
  wrongTypes: string[];
  error?: string;
};

const TODAY = new Date().toISOString().slice(0, 10);

function judge(fixture: Fixture, out: CommercialExtraction): Verdict {
  const missed: string[] = [];
  const invented: string[] = [];
  const wrongTypes: string[] = [];

  for (const type of fixture.expect.replyTypes) {
    if (!out.reply_types.includes(type)) missed.push(`reply_type:${type}`);
  }
  for (const type of fixture.expect.forbiddenReplyTypes ?? []) {
    if (out.reply_types.includes(type)) wrongTypes.push(`reply_type:${type}`);
  }

  // A parte que importa: inventar é pior do que falhar.
  const record = out as unknown as Record<string, unknown>;
  for (const field of fixture.expect.mustNotInvent) {
    const value = record[field];
    const filled = value !== null && value !== undefined && value !== '' &&
      !(Array.isArray(value) && value.length === 0);
    if (filled) invented.push(`${field}=${JSON.stringify(value)}`);
  }

  const e = fixture.expect;
  if (e.paidUsageRequested !== undefined && out.paid_usage_requested !== e.paidUsageRequested) {
    missed.push(`paid_usage_requested esperado ${e.paidUsageRequested}`);
  }
  if (e.explicitAcceptance !== undefined && out.explicit_acceptance !== e.explicitAcceptance) {
    missed.push(`explicit_acceptance esperado ${e.explicitAcceptance}`);
  }
  if (e.explicitRejection !== undefined && out.explicit_rejection !== e.explicitRejection) {
    missed.push(`explicit_rejection esperado ${e.explicitRejection}`);
  }
  if (e.deferral !== undefined && out.deferral !== e.deferral) {
    missed.push(`deferral esperado ${e.deferral}`);
  }
  if (e.promisedReplyDate === true && !out.promised_reply_date) {
    missed.push('promised_reply_date');
  }
  if (e.usagePeriodMentioned === true && !out.usage_period) {
    missed.push('usage_period');
  }
  if (e.cashAmountCents !== undefined && e.cashAmountCents !== null) {
    if (out.cash_amount_cents !== e.cashAmountCents) {
      missed.push(`cash_amount_cents esperado ${e.cashAmountCents}, veio ${out.cash_amount_cents}`);
    }
  }

  return { id: fixture.id, ok: !missed.length && !invented.length && !wrongTypes.length, missed, invented, wrongTypes };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY. A avaliação precisa do modelo real.');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY: o gateway grava cada corrida em ai_run.');
    process.exit(1);
  }

  const verdicts: Verdict[] = [];

  for (const fixture of FIXTURES) {
    process.stdout.write(`· ${fixture.id} … `);
    const result = await runPrompt(
      extractCommercial,
      {
        brandName: null,
        stage: 'unknown',
        thread: fixture.threadContext ?? '',
        message: fixture.message,
        today: TODAY,
      },
      { entityType: 'eval', entityId: null },
    );

    if (!result.ok) {
      verdicts.push({ id: fixture.id, ok: false, missed: [], invented: [], wrongTypes: [], error: result.message });
      console.log('erro');
      continue;
    }

    const verdict = judge(fixture, result.output);
    verdicts.push(verdict);
    console.log(verdict.ok ? 'ok' : 'falhou');
  }

  const passed = verdicts.filter((v) => v.ok).length;
  const hallucinated = verdicts.filter((v) => v.invented.length);

  console.log(`\n${passed}/${verdicts.length} casos limpos.`);

  for (const v of verdicts.filter((x) => !x.ok)) {
    console.log(`\n${v.id}`);
    if (v.error) console.log(`  erro: ${v.error}`);
    for (const m of v.missed) console.log(`  não apanhou: ${m}`);
    for (const i of v.invented) console.log(`  INVENTOU: ${i}`);
    for (const w of v.wrongTypes) console.log(`  tipo proibido: ${w}`);
  }

  if (hallucinated.length) {
    console.log(
      `\n${hallucinated.length} caso(s) com campos inventados. Isto é bloqueante: ` +
        'um valor de dinheiro ou de direitos preenchido sem estar na mensagem é ' +
        'pior do que um campo vazio.',
    );
    process.exit(1);
  }

  // Falhar em apanhar é aceitável até certo ponto — a caixa de revisão existe
  // para isso. Inventar não é, e já saiu acima.
  process.exit(passed / verdicts.length >= 0.7 ? 0 : 1);
}

void main();
