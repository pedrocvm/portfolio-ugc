import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ASSET_BYTES, ZONES, ZONE_LABELS, canonicalInstagramUrl, connectionState, draftFromAnalysis, draftSchema,
  intakeSchema, type ReferenceConnection, type ReferenceAnalysis,
} from './domain';
import { buildReferenceContext, DEFAULT_REFERENCE_REALITY } from '@/modules/content-brain/saved-reference-context';
import { validateAnalysisContext } from './prompt';
import { CONTENT_ZONES, parseScript, serializeScript } from '@/modules/content-board/domain';

const URL_A = 'https://www.instagram.com/reel/Dd44bVMN7O/?igsh=tracking';
const THEME_ID = '81be1d5d-ae8b-4c75-a84c-7a3b3b15329a';

test('o mesmo post tem uma identidade, independentemente do compartilhamento', () => {
  assert.equal(canonicalInstagramUrl(URL_A), 'https://www.instagram.com/p/Dd44bVMN7O/');
  assert.equal(canonicalInstagramUrl('https://instagram.com/p/Dd44bVMN7O/#saved'), canonicalInstagramUrl(URL_A));
  assert.equal(canonicalInstagramUrl('https://m.instagram.com/reels/Dd44bVMN7O/'), canonicalInstagramUrl(URL_A));
});

test('links não autorizam destinos arbitrários, credenciais ou perfis', () => {
  for (const url of [
    'http://instagram.com/reel/Dd44bVMN7O/', 'https://instagram.com.evil.test/reel/Dd44bVMN7O/',
    'https://evil.test/?url=https://instagram.com/reel/Dd44bVMN7O/',
    'https://user:secret@instagram.com/reel/Dd44bVMN7O/',
    'https://instagram.com:8443/reel/Dd44bVMN7O/', 'https://127.0.0.1/p/Dd44bVMN7O/',
    'https://instagram.com/carolxqueiroz/', 'https://instagram.com/p/Dd44bVMN7O/extra',
    'https://instagram.com/share/p/foo/', 'javascript:alert(1)',
  ]) assert.equal(canonicalInstagramUrl(url), null, url);
});

test('limites se aplicam também ao total e a propriedades não previstas', () => {
  assert.equal(intakeSchema.safeParse({ sourceUrl: URL_A }).success, true);
  assert.equal(intakeSchema.safeParse({ sourceUrl: URL_A, access_token: 'do-not-accept' }).success, false);
  assert.equal(intakeSchema.safeParse({ sourceUrl: URL_A, assets: [{ mimeType: 'text/html', size: 100 }] }).success, false);
  assert.equal(intakeSchema.safeParse({ sourceUrl: URL_A, assets: [{ mimeType: 'video/mp4', size: MAX_ASSET_BYTES + 1 }] }).success, false);
  assert.equal(intakeSchema.safeParse({ sourceUrl: URL_A, assets: Array.from({ length: 2 }, () => ({ mimeType: 'video/mp4', size: MAX_ASSET_BYTES })) }).success, false);
  const parsed = intakeSchema.parse({ sourceUrl: URL_A, caption: 'Legenda do autor' });
  assert.equal(parsed.transcript, '', 'a legenda não se transforma em fala');
});

test('o formulário exige a data real e as quatro variáveis editoriais', () => {
  const value = {
    referenceId: THEME_ID, pillarId: THEME_ID, subject: 'Como gravei uma cena em casa',
    zone: 'Z3', format: 'Reel falado', script: 'Proposta que ainda será revisada.', scheduledFor: '2026-10-06',
  };
  assert.equal(draftSchema.safeParse(value).success, true);
  assert.equal(draftSchema.safeParse({ ...value, scheduledFor: '2026-02-30' }).success, false);
  assert.equal(draftSchema.safeParse({ ...value, scheduledFor: '2026-02-29' }).success, false);
  assert.equal(draftSchema.safeParse({ ...value, scheduledFor: '2028-02-29' }).success, true);
  assert.equal(draftSchema.safeParse({ ...value, zone: undefined }).success, false);
  assert.equal(draftSchema.safeParse({ ...value, stage: 'published' }).success, false);
});

test('o rascunho de Referências abre nos campos do calendário e preserva a origem', () => {
  const sourceUrl = canonicalInstagramUrl(URL_A)!;
  const analysis: ReferenceAnalysis = {
    title: 'Uma gravação em casa', explanation: 'Organiza a gravação em etapas.',
    hook: '', structure: [], whyItWorks: '', transferableElements: [], limitations: [],
    adaptation: {
      pillarId: THEME_ID, subject: 'O bastidor da gravação', zone: 'Z3', format: 'Reel',
      angle: 'Mostrar uma tentativa real.', hook: 'Foi assim que gravei hoje.',
      outline: ['[Mostrar a mesa]', '“Comecei com o que tinha em casa.”'],
      recordingPlan: ['Usar a luz da janela.'], needsConfirmation: ['Confirmar o produto disponível.'],
      effort: '', whyItFits: '', whatToAvoid: [],
    },
  };
  const script = draftFromAnalysis({ sourceUrl, analysis });
  for (const zone of ZONES) {
    // O prefixo é o formato persistido por create_saved_reference_draft.
    const doc = parseScript(`Zona ${zone}\n\n${script}`);
    assert.equal(doc.zone, zone.toLowerCase());
    assert.equal(doc.angle, analysis.adaptation.angle);
    assert.equal(doc.hook, analysis.adaptation.hook);
    assert.equal(doc.body, [...analysis.adaptation.outline, 'Referência original', sourceUrl].join('\n\n'));
    assert.equal(doc.execution, analysis.adaptation.recordingPlan.join('\n\n'));
    assert.equal(doc.gate, analysis.adaptation.needsConfirmation.join('\n\n'));
    const saved = serializeScript(doc);
    assert.deepEqual(parseScript(saved), doc);
    assert.equal(saved.split(sourceUrl).length - 1, 1);
    assert.equal(CONTENT_ZONES.find((item) => item.code === zone)?.label, ZONE_LABELS[zone]);
  }
});

test('a interface não afirma uma conexão sem evidência de atividade', () => {
  const now = Date.parse('2026-10-04T17:00:00Z');
  const connection: ReferenceConnection = {
    id: THEME_ID, collectionName: 'CarolOS', enabled: true, tokenPrefix: 'ref_test',
    lastSeenAt: null, lastSyncAt: null, lastError: null, pollSeconds: 300, createdAt: new Date(now).toISOString(),
  };
  assert.equal(connectionState(null, now), 'unconfigured');
  assert.equal(connectionState(connection, now), 'waiting');
  assert.equal(connectionState({ ...connection, enabled: false }, now), 'paused');
  assert.equal(connectionState({ ...connection, lastError: 'Sessão interrompida' }, now), 'error');
  assert.equal(connectionState({ ...connection, lastSeenAt: new Date(now - 120_000).toISOString() }, now), 'connected');
  assert.equal(connectionState({ ...connection, lastSeenAt: new Date(now - 1_800_000).toISOString() }, now), 'offline');
  assert.equal(connectionState({ ...connection, lastSeenAt: 'invalid' }, now), 'offline');
});

test('a realidade editada e os temas dinâmicos governam a adaptação', () => {
  const context = buildReferenceContext({
    realityNotes: 'Esta semana só consigo gravar em casa.',
    pillars: [
      { id: THEME_ID, name: 'Meu novo tema', active: true, position: 0 },
      { id: 'old', name: 'Tema arquivado', active: false, position: 1 },
    ],
    recentContent: [{ subject: 'Gravação de ontem', format: 'Reel', scheduledFor: '2026-10-03' }],
  });
  assert.deepEqual(context.themes, [{ id: THEME_ID, name: 'Meu novo tema' }]);
  assert.equal(context.realityNotes, 'Esta semana só consigo gravar em casa.');
  assert.match(context.method, /Z4 significa Comunidade/);
  assert.match(context.method, /Z2 significa Retenção/);
  assert.equal(buildReferenceContext({ realityNotes: '', pillars: [], recentContent: [] }).realityNotes, DEFAULT_REFERENCE_REALITY);
});

test('um tema inventado pelo modelo nunca vira uma associação válida', () => {
  const context = buildReferenceContext({ realityNotes: '', pillars: [{ id: THEME_ID, name: 'Casa e rotina', active: true, position: 0 }], recentContent: [] });
  const analysis: ReferenceAnalysis = {
    title: 'Um detalhe da gravação', explanation: 'A referência organiza uma comparação visual.',
    hook: 'Mostra a diferença primeiro.', structure: ['Resultado', 'Processo'], whyItWorks: 'A comparação pode ajudar a entender a mudança.',
    transferableElements: ['Ordem das cenas'], limitations: [],
    adaptation: { pillarId: 'invented', subject: 'Uma cena em casa', zone: 'Z3', format: 'Reel', angle: '', hook: '', outline: [], recordingPlan: [], effort: '', whyItFits: '', whatToAvoid: [], needsConfirmation: [] },
  };
  const guarded = validateAnalysisContext(analysis, context);
  assert.equal(guarded.adaptation.pillarId, null);
  assert.equal(guarded.limitations.length, 1);
  assert.equal(analysis.adaptation.pillarId, 'invented', 'a resposta original não é alterada');
  const valid = { ...analysis, adaptation: { ...analysis.adaptation, pillarId: THEME_ID } };
  assert.equal(validateAnalysisContext(valid, context), valid);
});
