import assert from 'node:assert/strict';
import test from 'node:test';
import {
  forbiddenTopicProblems,
  selectWeekSeeds,
  teacherToneProblems,
  type RecentPiece,
  type TopicCandidate,
} from './domain';

const topics: TopicCandidate[] = [
  { id: 'u1', key: 'tech_ugc', name: 'Tech UGC', pillar: 'ugc_income', state: 'now', focusWeight: 3 },
  { id: 'u2', key: 'canvas_ugc', name: 'Canvas UGC', pillar: 'ugc_income', state: 'now', focusWeight: 3 },
  { id: 'e1', key: 'braga', name: 'Braga a Fundo', pillar: 'experiences', state: 'now', focusWeight: 0 },
  { id: 'e2', key: 'restaurants', name: 'Restaurantes', pillar: 'experiences', state: 'now', focusWeight: 0 },
  { id: 'h1', key: 'pets', name: 'Sete bichos', pillar: 'home', state: 'now', focusWeight: 0 },
  { id: 'h2', key: 'home_tech', name: 'Tecnologia em casa', pillar: 'home', state: 'now', focusWeight: 1 },
];

test('cold start não transforma a semana inteira em trabalho', () => {
  const plan = selectWeekSeeds(topics, []);
  assert.equal(plan.length, 3);
  assert.deepEqual(new Set(plan.map((p) => p.topic.pillar)), new Set(['ugc_income', 'experiences', 'home']));
  assert.deepEqual(plan.map((p) => p.objective), ['attract', 'retain', 'prove']);
});

test('pilar repetido recentemente perde prioridade', () => {
  const recent: RecentPiece[] = [
    { topicId: 'u1', pillar: 'ugc_income', objective: 'attract', lens: 'what_i_do' },
    { topicId: 'u2', pillar: 'ugc_income', objective: 'prove', lens: 'what_i_do' },
    { topicId: 'u1', pillar: 'ugc_income', objective: 'retain', lens: 'how_i_think' },
  ];
  const plan = selectWeekSeeds(topics, recent);
  assert.equal(plan.length, 3);
  assert.ok(plan.some((p) => p.topic.pillar === 'home'));
  assert.ok(plan.some((p) => p.topic.pillar === 'experiences'));
});

test('assunto pausado nunca entra', () => {
  const paused = topics.map((t) => (t.id === 'e1' ? { ...t, state: 'paused' as const } : t));
  const plan = selectWeekSeeds(paused, []);
  assert.ok(!plan.some((p) => p.topic.id === 'e1'));
});

test('detecta enquadramento de professora de creators', () => {
  assert.ok(teacherToneProblems('Se você é creator e está fazendo isso, está fazendo errado.').length > 0);
  assert.equal(teacherToneProblems('Eu fiz assim, deu errado e essa foi a parte que eu mudaria hoje.').length, 0);
});

test('Portugal como pauta explícita é recusado', () => {
  assert.ok(forbiddenTopicProblems('Como é morar em Portugal depois de quatro anos').length > 0);
  assert.equal(forbiddenTopicProblems('Uma experiência em Braga que eu queria guardar').length, 0);
});
