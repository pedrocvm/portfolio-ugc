import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

/** Testes de integração contra uma base a sério.
 *
 *  Correm só quando `SUPABASE_TEST_URL` e `SUPABASE_TEST_SERVICE_KEY` estiverem
 *  definidas — e essas têm de apontar para um projeto descartável, nunca para
 *  produção: estes testes escrevem e apagam. Sem elas, a suite salta com um
 *  aviso em vez de falhar, para o `npm test` continuar a correr em qualquer
 *  máquina.
 *
 *  O que provam é o que nenhum teste puro consegue provar: que as garantias
 *  estão mesmo na base — os índices únicos, as chaves de deduplicação, o
 *  trigger que congela um orçamento enviado e o RLS que fecha a porta ao
 *  anónimo. */

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_SERVICE_KEY;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;

const skip = !URL || !KEY;
const why = 'Define SUPABASE_TEST_URL e SUPABASE_TEST_SERVICE_KEY (projeto descartável) para correr isto.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient(URL!, KEY!, { auth: { persistSession: false } }) as any;

const tag = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('a mesma mensagem ingerida duas vezes não cria duas linhas', { skip: skip && why }, async (t) => {
  const client = db();
  const external = `${tag}-msg-1`;

  const { data: brand } = await client
    .from('brand')
    .insert({ name: `${tag} Marca`, normalized_name: tag.replace(/-/g, '') })
    .select('id')
    .single();

  const { data: thread } = await client
    .from('source_thread')
    .insert({ provider: 'manual', external_thread_id: `${tag}-thread`, brand_id: brand.id })
    .select('id')
    .single();

  t.after(async () => {
    await client.from('brand').delete().eq('id', brand.id);
    await client.from('source_thread').delete().eq('id', thread.id);
  });

  const row = {
    thread_id: thread.id,
    provider: 'manual',
    external_message_id: external,
    direction: 'inbound' as const,
    sent_at: new Date().toISOString(),
    body_text: 'olá',
  };

  await client.from('source_message').upsert(row, { onConflict: 'provider,external_message_id' });
  await client.from('source_message').upsert(row, { onConflict: 'provider,external_message_id' });

  const { count } = await client
    .from('source_message')
    .select('id', { count: 'exact', head: true })
    .eq('external_message_id', external);

  assert.equal(count, 1);
});

test('a chave de deduplicação impede dois eventos iguais', { skip: skip && why }, async (t) => {
  const client = db();
  const { data: brand } = await client
    .from('brand')
    .insert({ name: `${tag} Evento` })
    .select('id')
    .single();
  t.after(async () => { await client.from('brand').delete().eq('id', brand.id); });

  const key = `${tag}:reply.received`;
  const event = {
    event_type: 'reply.received',
    brand_id: brand.id,
    actor_type: 'brand',
    dedupe_key: key,
  };

  const first = await client.from('activity_event').insert(event);
  const second = await client.from('activity_event').insert(event);

  assert.equal(first.error, null);
  assert.equal(second.error?.code, '23505', 'a segunda inserção tem de bater na chave única');

  const { count } = await client
    .from('activity_event')
    .select('id', { count: 'exact', head: true })
    .eq('dedupe_key', key);
  assert.equal(count, 1);
});

test('só existe um follow-up aberto por oportunidade', { skip: skip && why }, async (t) => {
  const client = db();
  const { data: brand } = await client.from('brand').insert({ name: `${tag} Follow` }).select('id').single();
  const { data: opp } = await client
    .from('opportunity')
    .insert({ brand_id: brand.id, title: 'teste' })
    .select('id')
    .single();
  t.after(async () => { await client.from('brand').delete().eq('id', brand.id); });

  const followUp = {
    opportunity_id: opp.id,
    brand_id: brand.id,
    policy_version: 'followup-v1',
    situation: 'cold_outreach',
    due_at: new Date().toISOString(),
    status: 'scheduled',
  };

  assert.equal((await client.from('follow_up').insert(followUp)).error, null);
  const second = await client.from('follow_up').insert(followUp);
  assert.equal(second.error?.code, '23505', 'dois lembretes abertos para a mesma conversa é ruído');
});

test('um orçamento enviado não se pode alterar', { skip: skip && why }, async (t) => {
  const client = db();
  const { data: brand } = await client.from('brand').insert({ name: `${tag} Quote` }).select('id').single();
  const { data: opp } = await client
    .from('opportunity')
    .insert({ brand_id: brand.id, title: 'teste' })
    .select('id')
    .single();
  t.after(async () => { await client.from('brand').delete().eq('id', brand.id); });

  const { data: quote } = await client
    .from('quote')
    .insert({
      opportunity_id: opp.id,
      brand_id: brand.id,
      pricing_policy_version: 'v1-draft',
      recommended_cents: 13000,
      final_cents: 13000,
    })
    .select('id')
    .single();

  await client.from('quote').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quote.id);

  const mutated = await client.from('quote').update({ final_cents: 9900 }).eq('id', quote.id);
  assert.ok(mutated.error, 'alterar um orçamento enviado tem de ser recusado pela base');

  const { data: after } = await client.from('quote').select('final_cents').eq('id', quote.id).single();
  assert.equal(after.final_cents, 13000, 'o valor histórico continua intacto');
});

test('o anónimo não vê nada do CarolOS', { skip: (skip || !ANON) && `${why} E SUPABASE_TEST_ANON_KEY.` }, async () => {
  const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });

  for (const table of [
    'brand', 'opportunity', 'contact', 'activity_event', 'action_item',
    'source_message', 'source_thread', 'ai_run', 'payment', 'quote',
    'pricing_policy', 'integration_connection', 'app_setting', 'capture_item',
  ] as const) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    // Ou o RLS devolve zero linhas, ou recusa. Devolver dados é que não.
    assert.ok(error || (data ?? []).length === 0, `anon conseguiu ler ${table}`);
  }
});

test('o portfólio público continua legível pelo anónimo', { skip: (skip || !ANON) && `${why} E SUPABASE_TEST_ANON_KEY.` }, async () => {
  const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });

  const { error: contentError } = await anon
    .from('site_content')
    .select('data')
    .eq('key', 'published')
    .maybeSingle();
  assert.equal(contentError, null, 'o site publicado tem de continuar a ler-se');

  const { error: mediaError } = await anon.from('media_item').select('url').neq('niche', '').limit(1);
  assert.equal(mediaError, null, 'as media com nicho têm de continuar públicas');
});
