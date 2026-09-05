/** Importa a auditoria manual do Chrome como baseline histórico T0.
 *
 *      npm run import:audit -- <caminho para o AUDIT_PACKAGE>
 *
 *  Uma corrida só, não um processo. Depois disto o Instagram entra pela API e
 *  esta auditoria fica como o que é: uma fotografia de 05/09/2026 tirada à mão.
 *
 *  Cinco regras que este importador existe para respeitar:
 *
 *  1. **Célula vazia é NULL.** O CSV tem colunas em branco para watch time,
 *     conclusão, visitas de perfil e reposts. Nenhuma vira zero.
 *  2. **`shares: 0` da auditoria é suspeito.** A API devolveu 15 partilhas num
 *     Reel que o CSV traz a zero. O valor entra com `source=chrome_audit_t0` e
 *     nunca se mistura com dado da API na mesma coorte.
 *  3. **Trial continua desconhecido.** O CSV diz UNKNOWN em todas as linhas.
 *     Importar como «não» seria inventar um fato.
 *  4. **Idempotente.** A impressão digital do pacote é a chave; correr duas
 *     vezes não duplica nada.
 *  5. **Reconciliar por prova.** Permalink primeiro; sem permalink, data mais
 *     views. Sem correspondência, a linha fica registada como não reconciliada
 *     em vez de ser atribuída à peça mais parecida.
 *
 *  O pacote vive em `docs.local/`, que está no `.gitignore`. Nada do conteúdo
 *  dele entra no repositório. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hashContent } from '../lib/crypto.ts';
import { asJson } from '../lib/supabase/json.ts';
import { supabaseService } from '../lib/supabase/service.ts';

const SOURCE = 'chrome_audit_t0';

/** Uma célula vazia, `-` ou `n/a` é ausência. Nunca zero. */
function num(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const t = cell.trim();
  if (t === '' || t === '-' || /^n\/?a$/i.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** CSV com aspas e vírgulas dentro de campo. Sem dependência: o formato é
 *  simples e um parser de trinta linhas resolve-o. */
function parseCsv(text: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (aspas) {
      if (c === '"' && text[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === ',') { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }

  // O BOM do Excel encosta-se ao primeiro nome de coluna.
  const cabecalho = (linhas.shift() ?? []).map((h) => h.replace(/^﻿/, '').trim());
  return linhas
    .filter((l) => l.some((c) => c.trim()))
    .map((l) => Object.fromEntries(cabecalho.map((h, i) => [h, l[i] ?? ''])));
}

async function main() {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error('Uso: npm run import:audit -- <caminho para o AUDIT_PACKAGE>');
    process.exit(1);
  }

  const csvPath = path.join(pasta, 'instagram_carol_CONTENT_METRICS.csv');
  const jsonPath = path.join(pasta, 'instagram_carol_RAW_DATA.json');
  const csvRaw = readFileSync(csvPath, 'utf8');
  const jsonRaw = readFileSync(jsonPath, 'utf8');

  const fingerprint = await hashContent(csvRaw + jsonRaw);
  const bruto = JSON.parse(jsonRaw) as {
    audit?: { audit_datetime?: string };
    profile?: { followers?: number; posts?: number };
    general_insights?: Record<string, Record<string, unknown>>;
  };
  const observedAt = bruto.audit?.audit_datetime ?? new Date().toISOString();

  const db = supabaseService();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) { console.error('Não encontrei o usuário do CarolOS.'); process.exit(1); }

  const { data: jaFeito } = await db
    .from('instagram_baseline_import')
    .select('id, media_matched, media_unmatched')
    .eq('app_user_id', me.id)
    .eq('package_fingerprint', fingerprint)
    .maybeSingle();

  if (jaFeito) {
    console.log(`Este pacote já foi importado: ${jaFeito.media_matched} reconciliadas, ${jaFeito.media_unmatched} sem correspondência.`);
    return;
  }

  const { data: conta } = await db.from('instagram_account').select('id').limit(1).maybeSingle();
  if (!conta) { console.error('Liga o Instagram primeiro: sem conta não há a que reconciliar.'); process.exit(1); }

  const { data: midias } = await db
    .from('instagram_media')
    .select('id, external_media_id, permalink, published_at')
    .eq('account_id', conta.id);

  // A chave é o shortcode, não o URL inteiro: a auditoria escreve
  // `instagram.com/carolxqueiroz/reel/CODE/` e a API devolve
  // `instagram.com/reel/CODE/`. Comparar as strings dava zero em tudo.
  const porCodigo = new Map<string, string>();
  for (const m of midias ?? []) {
    const c = shortcode(m.permalink);
    if (c) porCodigo.set(c, m.id);
  }

  const linhas = parseCsv(csvRaw);
  let reconciliadas = 0;
  const semCorrespondencia: string[] = [];

  for (const l of linhas) {
    // O `content_id` do CSV já é o shortcode nas linhas que estão no feed.
    const codigo = shortcode(l.permalink) ?? (/^[A-Za-z0-9_-]{8,14}$/.test(l.content_id ?? '') ? l.content_id : null);
    const mediaId = codigo ? porCodigo.get(codigo) : undefined;

    if (!mediaId) {
      // Sem prova, não se atribui a peça nenhuma. O CSV tem linhas
      // «insights_only» que já não estão no feed e não têm permalink.
      semCorrespondencia.push(l.content_id || l.date || '?');
      continue;
    }

    const metricas = {
      views: num(l.views), reach: num(l.reach), likes: num(l.likes),
      comments: num(l.comments), saves: num(l.saves), shares: num(l.shares),
      total_interactions: num(l.interactions), follows: num(l.follows),
      profile_activity: num(l.profile_activity),
      avg_watch_time_raw: num(l.watch_time_average),
      total_watch_time_raw: num(l.watch_time_total),
    };

    const { error } = await db.from('instagram_media_snapshot').upsert(
      {
        media_id: mediaId,
        // A auditoria mediu o acumulado, não uma janela. T+30d é a janela mais
        // próxima disso e é onde não estraga a comparação das outras.
        snapshot_kind: 't30d',
        captured_at: observedAt,
        age_seconds: Math.max(0, Math.round((new Date(observedAt).getTime() - new Date(l.date).getTime()) / 1000)),
        ...metricas,
        // Segundos ficam por derivar: o CSV não documenta a unidade, e
        // adivinhá-la era o erro que o resto do sistema existe para não fazer.
        avg_watch_time_seconds: null,
        total_watch_time_seconds: null,
        raw_metrics: asJson({
          source: SOURCE,
          observedAt,
          note: 'Auditoria manual do Chrome. Unidade de watch time não documentada; shares pode ser artefacto da interface.',
          csv: l,
        }),
        api_version: 'n/a',
        source: SOURCE,
      },
      { onConflict: 'media_id,snapshot_kind', ignoreDuplicates: true },
    );

    if (error) console.warn(`  linha ${l.content_id}: ${error.message.slice(0, 120)}`);
    else reconciliadas += 1;

    // O estado de Trial vem UNKNOWN em todas as linhas. Regista-se a origem
    // para se saber que já foi visto, sem afirmar nada.
    if ((l.trial_status || '').toUpperCase() === 'UNKNOWN') {
      await db
        .from('instagram_media')
        .update({ trial_status_source: 'imported_audit' })
        .eq('id', mediaId)
        .eq('trial_status', 'unknown');
    }
  }

  // O retrato da conta, tal como a auditoria o viu.
  const trinta = bruto.general_insights?.['30_days'] ?? {};
  await db.from('instagram_account_snapshot').upsert(
    {
      account_id: conta.id,
      observed_on: observedAt.slice(0, 10),
      period: 'days_28',
      views: numeroDe(trinta.views),
      reach: numeroDe(trinta.reach) ?? numeroDe(trinta.viewers),
      accounts_engaged: numeroDe(trinta.accounts_engaged),
      total_interactions: numeroDe(trinta.interactions),
      profile_link_taps: numeroDe(trinta.external_link_taps),
      followers_count: bruto.profile?.followers ?? null,
      raw_metrics: asJson({ source: SOURCE, observedAt, general_insights: bruto.general_insights ?? {} }),
      api_version: 'n/a',
      source: SOURCE,
    },
    { onConflict: 'account_id,observed_on,period', ignoreDuplicates: true },
  );

  await db.from('instagram_baseline_import').insert({
    app_user_id: me.id,
    package_fingerprint: fingerprint,
    source: SOURCE,
    observed_at: observedAt,
    summary: asJson({
      rows: linhas.length,
      note: 'Trial status desconhecido em todas as linhas; watch time sem unidade documentada.',
    }),
    media_matched: reconciliadas,
    media_unmatched: semCorrespondencia.length,
  });

  console.log(`\nBaseline T0 importada.`);
  console.log(`  ${reconciliadas} linhas reconciliadas por permalink.`);
  console.log(`  ${semCorrespondencia.length} sem correspondência — ficam por reconciliar em vez de serem atribuídas à peça mais parecida.`);
  if (semCorrespondencia.length) console.log(`  (${semCorrespondencia.slice(0, 8).join(', ')}${semCorrespondencia.length > 8 ? '…' : ''})`);
  console.log(`  Trial status continua desconhecido: o CSV não o resolveu.\n`);
}

/** O shortcode de um permalink do Instagram, seja qual for a forma do caminho. */
function shortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function numeroDe(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'value' in v) return numeroDe((v as { value: unknown }).value);
  return null;
}

await main();
