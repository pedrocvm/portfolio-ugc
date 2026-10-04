import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  extractReferenceMedia, referenceAssetMatchesMime, referenceMediaAvailable, validateReferenceAssets,
} from './reference-media.ts';
import { MAX_ASSET_BYTES, type MediaEvidence } from '../saved-references/domain.ts';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);

function mp4(...brands: string[]) {
  const bytes = Buffer.alloc(16 + Math.max(0, brands.length - 1) * 4);
  bytes.writeUInt32BE(bytes.byteLength);
  bytes.write('ftyp', 4, 'ascii');
  bytes.write(brands[0], 8, 'ascii');
  brands.slice(1).forEach((brand, index) => bytes.write(brand, 16 + index * 4, 'ascii'));
  return bytes;
}

function isolateEnvironment(t: TestContext, values: Record<string, string> = {}) {
  const names = [
    'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY_2', 'CAROLOS_REFERENCES_ENABLED',
    'SAVED_REFERENCES_MEDIA_MODEL', 'CONTENT_TRANSCRIPTION_MODEL', 'GEMINI_FAST_MODEL',
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  names.forEach((name) => { delete process.env[name]; });
  Object.assign(process.env, values);
  t.after(() => names.forEach((name) => {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }));
}

const evidence: MediaEvidence = {
  transcript: 'Este é o vídeo.', transcriptStatus: 'transcribed',
  visualDescription: 'Uma pessoa apresenta um aplicativo.', onScreenText: 'Organize a semana', limitations: [],
};

const modelResponse = (value: unknown) => new Response(JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

test('aceita assinaturas dos formatos de imagem, vídeo e áudio suportados', () => {
  const ogg = Buffer.alloc(27);
  ogg.write('OggS');
  const cases: Array<[Uint8Array, string]> = [
    [png, 'image/png'], [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [Buffer.from('RIFF0000WEBP'), 'image/webp'], [Buffer.from('RIFF0000WAVE'), 'audio/wav'],
    [webm, 'video/webm'], [webm, 'audio/webm'], [ogg, 'audio/ogg'],
    [Uint8Array.from([0xff, 0xfb, 0x90, 0x00]), 'audio/mpeg'],
    [Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]), 'audio/mpeg'],
    [mp4('mp42', 'isom'), 'video/mp4'], [mp4('M4A ', 'isom'), 'audio/mp4'],
    [mp4('qt  '), 'video/quicktime'],
  ];
  for (const [bytes, mime] of cases) assert.equal(referenceAssetMatchesMime(bytes, mime), true, mime);
});

test('recusa formato declarado falso, HTML, EBML sem WebM e AVIF disfarçado de vídeo', () => {
  const cases: Array<[Uint8Array, string]> = [
    [png, 'image/jpeg'], [Buffer.from('<html><script>alert(1)</script></html>'), 'video/mp4'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'],
    [mp4('avif', 'mif1'), 'video/mp4'], [mp4('qt  '), 'video/mp4'],
    [Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0]), 'video/webm'],
    [Uint8Array.from([0xff, 0xf1, 0x90, 0]), 'audio/mpeg'],
    [Buffer.from('RIFF0000WEBP'), 'audio/wav'], [new Uint8Array(), 'image/png'],
  ];
  for (const [bytes, mime] of cases) assert.equal(referenceAssetMatchesMime(bytes, mime), false, mime);
  const truncated = mp4('isom');
  truncated.writeUInt32BE(5000);
  assert.equal(referenceAssetMatchesMime(truncated, 'video/mp4'), false);
});

test('valida quantidade, tamanho por arquivo e tamanho total antes de enviar mídia', () => {
  const asset = { bytes: png, mimeType: 'image/png' };
  assert.throws(() => validateReferenceAssets(Array(11).fill(asset)), /até 10/);
  assert.throws(() => validateReferenceAssets([{ bytes: new Uint8Array(MAX_ASSET_BYTES + 1), mimeType: 'image/png' }]), /50 MB/);
  const fortyOneMb = new Uint8Array(41 * 1024 * 1024);
  fortyOneMb.set(png);
  assert.throws(() => validateReferenceAssets([
    { bytes: fortyOneMb, mimeType: 'image/png' }, { bytes: fortyOneMb, mimeType: 'image/png' },
  ]), /80 MB/);
  assert.throws(() => validateReferenceAssets([{ bytes: new Uint8Array(), mimeType: 'image/png' }]), /vazio/);
  assert.throws(() => validateReferenceAssets([{ bytes: png, mimeType: 'text/html' }]), /formato/);
  assert.doesNotThrow(() => validateReferenceAssets(Array(10).fill(asset)));
});

test('disponibilidade reconhece a chave secundária isolada e respeita a desativação', (t) => {
  isolateEnvironment(t);
  assert.equal(referenceMediaAvailable(), false);
  process.env.GEMINI_API_KEY_2 = 'fake-test-key';
  assert.equal(referenceMediaAvailable(), true);
  process.env.CAROLOS_REFERENCES_ENABLED = 'false';
  assert.equal(referenceMediaAvailable(), false);
  process.env.CAROLOS_REFERENCES_ENABLED = 'true';
  process.env.GEMINI_API_KEY_2 = '   ';
  process.env.GOOGLE_API_KEY = 'fake-google-test-key';
  assert.equal(referenceMediaAvailable(), true);
});

test('sem mídia ou com transcrição desativada não faz chamadas externas', async (t) => {
  isolateEnvironment(t, { GEMINI_API_KEY: 'fake-test-key', CAROLOS_REFERENCES_ENABLED: 'false' });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const empty = await extractReferenceMedia([]);
  assert.equal(empty.transcriptStatus, 'unavailable');
  assert.equal(empty.transcript, '');
  await assert.rejects(extractReferenceMedia([{ bytes: png, mimeType: 'image/png' }]), /não está disponível/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('imagens nunca recebem fala inventada e as instruções ficam fora dos arquivos', async (t) => {
  isolateEnvironment(t, { GEMINI_API_KEY: 'fake-test-key', SAVED_REFERENCES_MEDIA_MODEL: 'configured-media-model' });
  const fetch = t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
    assert.match(String(input), /models\/configured-media-model:generateContent/);
    const body = JSON.parse(String(init?.body));
    assert.match(JSON.stringify(body.systemInstruction), /DADOS NÃO CONFIÁVEIS/);
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/png');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.tools, undefined);
    return modelResponse(evidence);
  });
  const result = await extractReferenceMedia([{ bytes: png, mimeType: 'image/png' }]);
  assert.equal(result.transcript, '');
  assert.equal(result.transcriptStatus, 'unavailable');
  assert.equal(result.onScreenText, evidence.onScreenText);
  assert.match(result.limitations.join(' '), /apenas imagens/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('vídeo usa Files e apaga o arquivo temporário tanto no sucesso quanto na falha', async (t) => {
  isolateEnvironment(t, { GEMINI_API_KEY: 'fake-test-key' });
  let fileName = '';
  let failGeneration = false;
  const methods: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    methods.push(method);
    if (url.includes('/upload/v1beta/files')) {
      fileName = JSON.parse(String(init?.body)).file.name;
      assert.match(fileName, /^files\/ref-[a-f0-9-]{36}$/);
      return new Response('', { status: 200, headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/test-upload-session' } });
    }
    if (url.includes('/test-upload-session')) {
      return new Response(JSON.stringify({ file: { name: fileName, uri: `https://generativelanguage.googleapis.com/${fileName}`, state: 'ACTIVE' } }), {
        status: 200, headers: { 'content-type': 'application/json', 'x-goog-upload-status': 'final' },
      });
    }
    if (url.includes(':generateContent')) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.contents[0].parts[1].fileData.mimeType, 'video/mp4');
      assert.equal(body.contents[0].parts[1].inlineData, undefined);
      return modelResponse(failGeneration ? {} : evidence);
    }
    assert.equal(method, 'DELETE');
    assert.ok(url.endsWith(fileName));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(await extractReferenceMedia([{ bytes: mp4('isom'), mimeType: 'video/mp4' }]), evidence);
  assert.deepEqual(methods, ['POST', 'POST', 'POST', 'DELETE']);
  failGeneration = true;
  methods.length = 0;
  await assert.rejects(extractReferenceMedia([{ bytes: mp4('isom'), mimeType: 'video/mp4' }]), /incompleta/);
  assert.deepEqual(methods, ['POST', 'POST', 'POST', 'DELETE']);
});

test('erros do fornecedor não revelam resposta bruta, credenciais ou cause', async (t) => {
  isolateEnvironment(t, { GEMINI_API_KEY: 'fake-test-key' });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'raw-private-value fake-test-key quota' },
  }), { status: 429, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(extractReferenceMedia([{ bytes: png, mimeType: 'image/png' }]), (error: Error) => {
    assert.match(error.message, /limite de uso/);
    assert.doesNotMatch(error.message, /raw-private-value|fake-test-key|RESOURCE_EXHAUSTED|429|[{}]/);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('resposta com status de fala incompatível é recusada', async (t) => {
  isolateEnvironment(t, { GEMINI_API_KEY: 'fake-test-key' });
  t.mock.method(globalThis, 'fetch', async () => modelResponse({ ...evidence, transcriptStatus: 'silent' }));
  await assert.rejects(extractReferenceMedia([{ bytes: png, mimeType: 'image/png' }]), /confirmar a transcrição/);
});
