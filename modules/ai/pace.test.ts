import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { paced } from './pace.ts';

/** A fila é estado do módulo e sobrevive de teste para teste. Cada um começa
 *  uma hora à frente do anterior, para o intervalo da chamada anterior já ter
 *  passado — senão um teste herda a espera do outro. O relógio arranca numa
 *  data real: a zero, o `lastStart` inicial parece «agora mesmo». */
let relogio = 1_800_000_000_000;
const comRelogioFalso = () => {
  relogio += 3_600_000;
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: relogio });
};

const quota429 = (extra = '') =>
  new Error(`{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"${extra}}}`);

/** Sem relógio falso isto demorava minutos: o espaçamento é de 4,5s.
 *
 *  Salta até o trabalho acabar, e não um número fixo de vezes: com o número
 *  fixo, código que agenda uma espera depois do último salto deixava a suite
 *  pendurada para sempre — e pendurada é pior que falhada, porque não diz nada. */
const withFakeClock = async (body: () => Promise<void>) => {
  comRelogioFalso();
  try {
    let done = false;
    const running = body().finally(() => {
      done = true;
    });
    for (let i = 0; i < 500 && !done; i++) {
      await Promise.resolve();
      await Promise.resolve();
      mock.timers.tick(5_000);
    }
    if (!done) throw new Error('o trabalho não acabou em 500 saltos do relógio');
    await running;
  } finally {
    mock.timers.reset();
  }
};

/** Deixa correr as microtarefas sem mexer no relógio. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test('as chamadas saem espaçadas, não todas de uma vez', async () => {
  comRelogioFalso();
  try {
    let comecaram = 0;
    const p = paced({
      async text() {
        comecaram++;
        return 'ok';
      },
    });
    const todas = Promise.all([p.text(), p.text(), p.text()]);

    // Sem avançar o relógio, só a primeira pode ter saído. Medir a distância
    // entre elas com o relógio a andar media os saltos do teste, não a fila.
    await flush();
    assert.equal(comecaram, 1, 'saíram todas de uma vez, sem esperar a vez');

    mock.timers.tick(4_500);
    await flush();
    assert.equal(comecaram, 2, 'a segunda não saiu depois do intervalo');

    mock.timers.tick(4_500);
    await flush();
    assert.equal(comecaram, 3);

    await todas;
  } finally {
    mock.timers.reset();
  }
});

test('uma cota por minuto é repetida, e a segunda tentativa passa', async () => {
  let n = 0;
  const p = paced({
    async text() {
      n++;
      if (n === 1) throw quota429(',"quotaId":"GenerateRequestsPerMinute"');
      return 'à segunda';
    },
  });

  let out: unknown;
  await withFakeClock(async () => {
    out = await p.text();
  });
  assert.equal(out, 'à segunda');
  assert.equal(n, 2);
});

test('a cota do dia não se repete: esperar não a devolve', async () => {
  let n = 0;
  const p = paced({
    async text() {
      n++;
      throw quota429(',"quotaId":"GenerateRequestsPerDayPerProject-FreeTier"');
    },
  });

  await withFakeClock(async () => {
    await assert.rejects(p.text());
  });
  assert.equal(n, 1, 'tentou outra vez uma cota que só volta amanhã');
});

test('uma chave errada não se repete', async () => {
  let n = 0;
  const p = paced({
    async text() {
      n++;
      throw new Error('[401] API_KEY_INVALID');
    },
  });
  await withFakeClock(async () => {
    await assert.rejects(p.text());
  });
  assert.equal(n, 1);
});

test('uma falha não parte a fila para quem vem a seguir', async () => {
  let n = 0;
  const p = paced({
    async text(input: { falha?: boolean } = {}) {
      n++;
      if (input.falha) throw new Error('[401] API_KEY_INVALID');
      return 'segui';
    },
  });

  await withFakeClock(async () => {
    await assert.rejects(p.text({ falha: true }));
    assert.equal(await p.text(), 'segui');
  });
  assert.equal(n, 2);
});

test('um stream espera a vez mas não é repetido: duplicaria o que já saiu', async () => {
  let n = 0;
  const p = paced({
    async *stream() {
      n++;
      yield 'a';
      throw quota429();
    },
  });

  const vistos: unknown[] = [];
  await withFakeClock(async () => {
    await assert.rejects(async () => {
      for await (const c of p.stream()) vistos.push(c);
    });
  });
  assert.equal(n, 1, 'repetiu um stream e ia duplicar os pedaços');
  assert.deepEqual(vistos, ['a']);
});

test('sem saldo não se repete: esperar não carrega a conta', async () => {
  let n = 0;
  const p = paced({
    async text() {
      n++;
      throw new Error('{"error":{"code":429,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}');
    },
  });
  await withFakeClock(async () => {
    await assert.rejects(p.text());
  });
  assert.equal(n, 1, 'gastou tentativas numa conta sem saldo');
});
