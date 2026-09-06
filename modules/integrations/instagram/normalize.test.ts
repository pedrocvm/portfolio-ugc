import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMetric } from '@/modules/content-brain/metrics';
import {
  REELS_METRICS,
  STORY_METRICS,
  metricsFor,
  normalizeInsights,
  normalizeMedia,
  snapshotColumns,
  unitFor,
} from './normalize';
import { classifyMetaError, redact, unsupportedMetricsFrom } from './errors';

const V = 'v26.0';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

/** Resposta real de `18087356288285735/insights`, 05/09/2026. */
const REELS_INSIGHTS = {
  data: [
    { name: 'views', period: 'lifetime', values: [{ value: 2257 }] },
    { name: 'reach', period: 'lifetime', values: [{ value: 1408 }] },
    { name: 'likes', period: 'lifetime', values: [{ value: 76 }] },
    { name: 'comments', period: 'lifetime', values: [{ value: 23 }] },
    { name: 'saved', period: 'lifetime', values: [{ value: 2 }] },
    { name: 'shares', period: 'lifetime', values: [{ value: 15 }] },
    { name: 'total_interactions', period: 'lifetime', values: [{ value: 119 }] },
    { name: 'ig_reels_avg_watch_time', period: 'lifetime', values: [{ value: 11768 }] },
    { name: 'ig_reels_video_view_total_time', period: 'lifetime', values: [{ value: 18547084 }] },
  ],
};

/** Resposta real de `me/insights`, que usa `total_value` em vez de `values`. */
const ACCOUNT_INSIGHTS = {
  data: [
    { name: 'reach', period: 'day', total_value: { value: 646 } },
    { name: 'views', period: 'day', total_value: { value: 2025 } },
  ],
};

/** Erro real da conta: `profile_visits` e `follows` não existem para REELS. */
const UNSUPPORTED_ERROR = {
  error: {
    message: 'The Media Insights API does not support the profile_visits, follows metric for this media product type.',
    type: 'IGApiException',
    code: 100,
    fbtrace_id: 'AMp1OApnabZXALO89OiY4ox',
  },
};

/** Erro real de uma publicação de 2023, anterior à conta profissional. */
const PRE_BUSINESS_ERROR = {
  error: {
    message: 'Os conteúdos multimédia foram publicados antes da hora mais recente em que a conta do utilizador foi convertida numa conta comercial a partir de uma conta pessoal.',
    type: 'IGApiException',
    code: 100,
    error_subcode: 2108006,
  },
};

/* ── Normalização ─────────────────────────────────────────────────────────── */

test('lê a forma values[] dos insights de mídia', () => {
  const n = normalizeInsights({ requested: REELS_METRICS, payload: REELS_INSIGHTS, apiVersion: V });
  assert.equal(n.metrics.views.valueRaw, 2257);
  assert.equal(n.metrics.views.available, true);
  assert.equal(n.metrics.comments.valueRaw, 23);
});

test('lê a forma total_value dos insights de conta', () => {
  const n = normalizeInsights({ requested: ['reach', 'views'], payload: ACCOUNT_INSIGHTS, apiVersion: V });
  assert.equal(n.metrics.reach.valueRaw, 646);
  assert.equal(n.metrics.views.valueRaw, 2025);
});

test('o watch time preserva o bruto e a unidade documentada', () => {
  const n = normalizeInsights({ requested: REELS_METRICS, payload: REELS_INSIGHTS, apiVersion: V });
  const avg = n.metrics.ig_reels_avg_watch_time;
  assert.equal(avg.valueRaw, 11768);
  assert.equal(avg.unitRaw, 'milliseconds');
  assert.equal(avg.valueNormalizedSeconds, 11.768);
  assert.equal(avg.apiVersion, V);
  // Um Reel de dezoito segundos não pode ter 11768 segundos de retenção média.
  assert.ok(avg.valueNormalizedSeconds! < 60);
  assert.equal(formatMetric(avg), '11,8 s');
});

test('uma métrica que só tem contagem não é tratada como tempo', () => {
  assert.equal(unitFor('views'), 'count');
  assert.equal(unitFor('metrica_que_nao_existe'), 'count');
  assert.equal(unitFor('ig_reels_video_view_total_time'), 'milliseconds');
});

test('métrica pedida e não devolvida fica indisponível, não zero', () => {
  const n = normalizeInsights({
    requested: [...REELS_METRICS, 'profile_visits', 'follows'],
    payload: REELS_INSIGHTS,
    apiVersion: V,
    unsupported: ['profile_visits', 'follows'],
  });
  assert.equal(n.metrics.profile_visits.available, false);
  assert.equal(n.metrics.profile_visits.valueRaw, null);
  assert.match(n.metrics.profile_visits.unavailableReason!, /não fornece/i);
  assert.notEqual(n.metrics.profile_visits.valueRaw, 0);
});

test('as colunas do snapshot devolvem null para o que não veio', () => {
  const n = normalizeInsights({
    requested: [...REELS_METRICS, 'profile_visits', 'follows'],
    payload: REELS_INSIGHTS,
    apiVersion: V,
    unsupported: ['profile_visits', 'follows'],
  });
  const c = snapshotColumns(n.metrics);
  assert.equal(c.views, 2257);
  assert.equal(c.saves, 2);
  assert.equal(c.shares, 15, 'shares zero na auditoria web era artefacto da interface');
  assert.equal(c.follows, null);
  assert.equal(c.profile_activity, null);
  assert.equal(c.avg_watch_time_raw, 11768);
  assert.equal(c.avg_watch_time_seconds, 11.768);
});

test('um payload vazio devolve tudo indisponível em vez de rebentar', () => {
  const n = normalizeInsights({ requested: ['views', 'reach'], payload: { data: [] }, apiVersion: V });
  assert.equal(n.metrics.views.available, false);
  assert.equal(n.metrics.reach.available, false);
});

test('um payload inválido não derruba a normalização', () => {
  const n = normalizeInsights({ requested: ['views'], payload: 'lixo', apiVersion: V });
  assert.equal(n.metrics.views.available, false);
});

/* ── Conjuntos por tipo ───────────────────────────────────────────────────── */

test('cada tipo de mídia pede as métricas que existem para ele', () => {
  // Verificado contra a API: pedir profile_visits num Reel devolve erro 100.
  assert.equal(metricsFor('REELS', 'VIDEO').includes('profile_visits'), false);
  assert.equal(metricsFor('REELS', 'VIDEO').includes('ig_reels_avg_watch_time'), true);
  assert.equal(metricsFor('STORY', 'VIDEO').includes('navigation'), true);
  assert.equal(metricsFor('FEED', 'IMAGE').includes('ig_reels_avg_watch_time'), false);
  assert.equal(STORY_METRICS.includes('replies'), true);
});

/* ── Erros ────────────────────────────────────────────────────────────────── */

test('métrica não suportada é lida da mensagem e não derruba o sync', () => {
  const e = classifyMetaError({ status: 400, body: UNSUPPORTED_ERROR });
  assert.equal(e.kind, 'unsupported_metric');
  assert.deepEqual(e.unsupportedMetrics, ['profile_visits', 'follows']);
  assert.equal(e.retryable, false);
});

test('publicação anterior à conta profissional é indisponível, não erro nosso', () => {
  const e = classifyMetaError({ status: 400, body: PRE_BUSINESS_ERROR });
  assert.equal(e.kind, 'not_available');
});

test('token revogado e token expirado são coisas diferentes', () => {
  const revogado = classifyMetaError({ status: 401, body: { error: { message: 'x', code: 190, error_subcode: 460 } } });
  assert.equal(revogado.kind, 'auth_revoked');
  const expirado = classifyMetaError({ status: 401, body: { error: { message: 'Session expired', code: 190 } } });
  assert.equal(expirado.kind, 'token_expired');
  assert.equal(expirado.retryable, false, 'insistir num token expirado não o conserta');
});

test('rate limit e 5xx são recuperáveis; 4xx não', () => {
  assert.equal(classifyMetaError({ status: 429, body: null }).retryable, true);
  assert.equal(classifyMetaError({ status: 500, body: null }).retryable, true);
  assert.equal(classifyMetaError({ status: 400, body: { error: { message: 'x', code: 100 } } }).retryable, false);
  assert.equal(classifyMetaError({ status: 403, body: { error: { message: 'x', code: 10 } } }).kind, 'permission_missing');
});

test('um token nunca sai numa mensagem de erro', () => {
  // Token falso, com o formato certo. Este teste existe para provar que um
  // token é redigido — copiar um pedaço do verdadeiro para dentro dele seria
  // exatamente o vazamento que ele diz estar a impedir. E o repositório é
  // público.
  const sujo = 'falhou em https://graph.instagram.com/v26.0/me?access_token=IGAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const limpo = redact(sujo);
  assert.doesNotMatch(limpo, /IGAA/);
  assert.match(limpo, /\[redigido\]/);

  const erro = classifyMetaError({ status: 400, body: { error: { message: sujo, code: 100 } } });
  assert.doesNotMatch(erro.message, /IGAA/);
});

test('a mensagem de erro é truncada para não encher um log', () => {
  assert.ok(redact('x'.repeat(2000)).length <= 500);
});

test('extrai nomes de métrica sem apanhar prosa', () => {
  assert.deepEqual(unsupportedMetricsFrom('does not support the profile_visits metric for this'), ['profile_visits']);
  assert.deepEqual(unsupportedMetricsFrom('sem nada'), []);
});

/* ── Mídia ────────────────────────────────────────────────────────────────── */

test('normaliza uma mídia real preservando o que a API deu e o que não deu', () => {
  const m = normalizeMedia({
    id: '18093704897242370',
    caption: 'O impossível as vezes é uma questão de tentar até conseguir!',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    permalink: 'https://www.instagram.com/reel/Dc1pjdVsjGW/',
    timestamp: '2026-09-03T20:17:12+0000',
    is_shared_to_feed: false,
  });
  assert.equal(m.externalMediaId, '18093704897242370');
  assert.equal(m.mediaProductType, 'REELS');
  assert.equal(m.isSharedToFeed, false);
  assert.equal(m.commentsCount, null, 'contagem não pedida é null, não zero');
});
