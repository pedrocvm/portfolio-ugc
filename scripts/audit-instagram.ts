/** A auditoria real do conteúdo, contra a Meta API e a base de produção.
 *
 *      node --env-file-if-exists=.env.local --import ./scripts/test-alias.mjs scripts/audit-instagram.ts
 *
 *  O que faz, por ordem, e o que imprime:
 *
 *  1. sincroniza a conta inteira (`allMedia`), stories ativos, janelas devidas
 *     e a leitura atual de todo o Feed fora de janela;
 *  2. etiqueta pela legenda o que ainda não tem etiqueta;
 *  3. reagrupa Stories em sequências;
 *  4. deriva a escada de aprendizado;
 *  5. imprime a auditoria do Feed e dos Stories tal como a tela a lê.
 *
 *  Nada aqui inventa: se a API não devolver, a linha diz «indisponível». Com
 *  `--triage`, relê também as conversas comerciais e refaz a manhã — é o que
 *  o cron das 6h faria, e serve para ver a próxima ação real no Hoje. */

import { supabaseService } from '../lib/supabase/service.ts';
import { syncInstagram } from '../modules/integrations/instagram/sync.ts';
import { auditFeedCaptions, deriveLearnings, feedAudit, rebuildStorySequences, storyAudit } from '../modules/content-brain/performance-service.ts';

const triage = process.argv.includes('--triage') || process.argv.includes('--only-triage');
const soTriagem = process.argv.includes('--only-triage');
const soRelatorio = process.argv.includes('--report');

async function main() {
  const db = supabaseService();

  if (soTriagem) return triagem(db);

  if (!soRelatorio) {
    console.log('── 1. sync completo ──');
    const sync = await syncInstagram({ allMedia: true, maxSnapshots: 80, maxLatest: 120 });
    console.log(JSON.stringify({ ...sync, failures: sync.failures.slice(0, 8) }, null, 2));

    console.log('\n── 2. etiquetas pela legenda ──');
    console.log(JSON.stringify(await auditFeedCaptions(60), null, 2));

    console.log('\n── 3. sequências de stories ──');
    console.log(JSON.stringify(await rebuildStorySequences(), null, 2));

    console.log('\n── 4. escada de aprendizado ──');
    console.log(JSON.stringify(await deriveLearnings(), null, 2));
  }

  console.log('\n── 5. auditoria do Feed ──');
  const feed = await feedAudit(80, { db });
  console.log('amostra:', JSON.stringify(feed.sample));
  for (const p of feed.summary) console.log(`• ${p.text}\n    ${p.sample} · ${p.confidence}${p.evidence.length ? ` · prova: ${p.evidence.length}` : ''}`);
  console.log('\npeças (mais recente primeiro):');
  for (const p of feed.pieces) {
    console.log(`- ${p.publishedAt.slice(0, 10)} ${p.mediaProductType.padEnd(5)} «${p.title.slice(0, 48)}»`);
    console.log(`    ${p.audit.relativeLine}`);
    console.log(`    formato ${p.audit.format} · tema ${p.audit.theme} · gancho ${p.audit.hook} · ${p.audit.sample}`);
    if (p.audit.signals.length) console.log(`    sinais: ${p.audit.signals.join(' · ')}`);
    console.log(`    hipótese: ${p.audit.hypothesis}`);
  }

  console.log('\n── 6. stories ──');
  const { data: cron } = await db.rpc('carolos_schedule_status');
  const ligado = Array.isArray(cron) && (cron as { job_name: string; active: boolean }[]).some((r) => r.job_name === 'carolos-instagram-sync' && r.active);
  const stories = await storyAudit({ syncScheduled: ligado, db });
  console.log(stories.coverage.line);
  console.log(`ativos ${stories.active} · expirados ${stories.expired} · sequências ${stories.sequences.length}`);
  for (const s of stories.sequences) {
    console.log(`- ${s.label}: ${s.storyCount} frames · começaram ${s.metrics.firstReach ?? 'indisponível'} · último ${s.metrics.lastReach ?? 'indisponível'} · proxy ${s.metrics.reachRetentionProxy ?? '—'} · cobertura ${s.metrics.coverage}${s.comparison ? ` · ${s.comparison}` : ''}`);
  }
  console.log(stories.guidance.because);
  for (const l of stories.guidance.lines) console.log(`• ${l.text} (${l.sample})`);

  if (triage) await triagem(db);
}

async function triagem(db: ReturnType<typeof supabaseService>) {
  {
    console.log('\n── 7. triagem das conversas + manhã ──');
    const { getFlagsService } = await import('../modules/settings/service.ts');
    const { triageThreads } = await import('../modules/email/triage-service.ts');
    const flags = await getFlagsService();
    console.log(JSON.stringify(await triageThreads(flags, 40), null, 2));
    const { data: acoes } = await db
      .from('thread_intel')
      .select('next_action_type, next_action, brand:brand_id ( name )')
      .not('next_action_type', 'in', '("no_action_required","wait_until_date")');
    for (const a of acoes ?? []) {
      const n = a.next_action as { title?: string; target?: { to?: string | null } };
      const b = a.brand as { name: string } | { name: string }[] | null;
      console.log(`- ${(Array.isArray(b) ? b[0]?.name : b?.name) ?? '?'}: ${a.next_action_type} — ${n.title}${n.target?.to ? ` → ${n.target.to}` : ''}`);
    }
    const { replanActions, replanGlobalActions } = await import('../modules/actions/service.ts');
    await replanActions(db);
    await replanGlobalActions(db);
    const { consolidateMorning } = await import('../modules/morning/service.ts');
    const manha = await consolidateMorning();
    console.log(JSON.stringify(manha ? { headline: manha.headline, decisions: manha.decisions.map((d) => `${d.kind} · ${d.subject} · ${d.headline}`), signals: manha.signals, gaps: manha.gaps } : null, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
