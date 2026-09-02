/** Dinheiro é sempre um inteiro em cêntimos. Nenhuma operação comercial do
 *  CarolOS pode passar por vírgula flutuante: somar 0.1 + 0.2 uma vez basta
 *  para uma proposta sair com um cêntimo a menos e ninguém entender porquê. */

export type Currency = 'EUR' | 'USD' | 'GBP' | 'BRL';

export const CURRENCY_LOCALE: Record<Currency, string> = {
  EUR: 'pt-PT',
  USD: 'en-US',
  GBP: 'en-GB',
  BRL: 'pt-BR',
};

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number, currency: Currency = 'EUR') {
  const key = currency;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'pt-PT', {
      style: 'currency',
      currency,
    });
    formatters.set(key, f);
  }
  return f.format(cents / 100);
}

/** «1.250,50», «1250.50», «1 250 €» → cêntimos. `null` quando não é número.
 *  Uma ou duas casas depois do último separador são decimais; três são
 *  milhares, que é como se escreve 1.500 por cá. */
export function parseMoneyToCents(raw: unknown): number | null {
  const t = String(raw ?? '').replace(/[^\d.,]/g, '');
  if (!t) return null;

  const sep = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  const after = sep < 0 ? '' : t.slice(sep + 1);
  const decimal = /^\d{1,2}$/.test(after);

  const whole = (decimal ? t.slice(0, sep) : t).replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole)) return null;

  return Number(whole) * 100 + (decimal ? Number(after.padEnd(2, '0')) : 0);
}

/** Percentagem sobre um valor em cêntimos, arredondada ao cêntimo mais próximo.
 *  Meio cêntimo arredonda para cima: é a convenção que a proposta escrita usa. */
export const applyPercent = (cents: number, percent: number) =>
  Math.round(cents * (percent / 100));

export const sumCents = (values: readonly number[]) =>
  values.reduce((total, v) => total + v, 0);
