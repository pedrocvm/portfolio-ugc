/** Pergunta a cada chave se ainda pode. Uma chamada mínima por chave.
 *
 *  Uso: npm run ai:keys
 *
 *  Nunca imprime a chave: só os últimos quatro caracteres, que chegam para
 *  saber de qual se fala e não chegam para a usar. */
const keys = [
  ['GEMINI_API_KEY', process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY],
  ...[2, 3, 4, 5].map((n) => [`GEMINI_API_KEY_${n}`, process.env[`GEMINI_API_KEY_${n}`]]),
  ['GEMINI_SEARCH_API_KEY', process.env.GEMINI_SEARCH_API_KEY],
].filter(([, v]) => v?.trim());

if (keys.length === 0) {
  console.error('nenhuma chave do Gemini no ambiente');
  process.exit(1);
}

const model = process.env.GEMINI_CHAT_MODEL ?? 'gemini-flash-lite-latest';
console.log(`modelo: ${model}\n`);

/** Duas cotas diferentes: a normal e a da pesquisa Google. Só a segunda é que
 *  a descoberta usa, e é a que não aparece no erro. */
async function ask(key, grounded) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: grounded ? 'Que dia é hoje?' : 'oi' }] }],
        generationConfig: { maxOutputTokens: grounded ? 32 : 1 },
        ...(grounded ? { tools: [{ googleSearch: {} }] } : {}),
      }),
    },
  );
  if (res.ok) return 'responde';
  const body = await res.json().catch(() => ({}));
  const q = body?.error?.details?.find((d) => d['@type']?.endsWith('QuotaFailure'));
  const qid = q?.violations?.[0]?.quotaId;
  return `${res.status} ${body?.error?.status ?? ''}${qid ? ` — cota ${qid}` : ''}\n     ${(body?.error?.message ?? '').split('\n')[0].slice(0, 130)}`;
}

for (const [name, key] of keys) {
  const tag = `${name} (…${key.slice(-4)})`;
  // Só a chave de pesquisa precisa de responder à pesquisa: é a única que serve
  // a descoberta, e é a única que se espera que esteja num projeto faturado.
  const searchOnly = name === 'GEMINI_SEARCH_API_KEY';
  console.log(`${tag}${searchOnly ? '  ← a que paga, só para a descoberta' : ''}`);
  console.log(`  normal:   ${await ask(key, false)}`);
  console.log(`  pesquisa: ${await ask(key, true)}${searchOnly ? '' : '   (não precisa: não é esta que pesquisa)'}`);
}

if (!process.env.GEMINI_SEARCH_API_KEY?.trim()) {
  console.log('\nSem GEMINI_SEARCH_API_KEY. A descoberta vai à cadeia normal e');
  console.log('falha lá: a pesquisa Google não existe no plano grátis.');
}
