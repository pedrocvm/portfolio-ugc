/** A ficha de cliente não é uma tabela nova: um cliente é uma marca que já
 *  fechou, e o trabalho dela são os documentos que lhe dizem respeito. Tudo
 *  isto já está na base — o que faltava era a leitura.
 *  ponytail: se um dia houver trabalhos sem documento ou faturas próprias,
 *  aí sim nasce uma tabela `job`. */

import type { Brand } from './brands';
import type { DocKind, DocRow } from './documents';

/** Onde cada tipo de documento guarda o nome da marca e o valor. */
const NAME_FIELD: Record<DocKind, string> = {
  proposal: 'brand',
  contract: 'clientName',
  usage: 'brand',
};
const VALUE_FIELD: Record<DocKind, string> = {
  proposal: 'price',
  contract: 'price',
  usage: 'fee',
};

/** Uma proposta ainda não é dinheiro: só conta o que foi assinado. */
const BILLABLE: DocKind[] = ['contract', 'usage'];

export type Work = {
  id: string;
  kind: DocKind;
  title: string;
  date: string;
  cents: number | null;
  billable: boolean;
};

export type Client = {
  brand: Brand;
  works: Work[];
  billedCents: number;
  lastAt: string;
};

const key = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** «1.250,50», «1250.50», «1 250 €» → cêntimos. `null` se não for número.
 *  Inteiro em cêntimos e nunca float: dinheiro somado em vírgula flutuante
 *  acaba sempre a faltar um cêntimo. */
export function toCents(raw: unknown): number | null {
  const t = String(raw ?? '').replace(/[^\d.,]/g, '');
  if (!t) return null;

  const sep = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  const after = sep < 0 ? '' : t.slice(sep + 1);
  /* uma ou duas casas depois do último separador são decimais; três são
     milhares, que é como se escreve 1.500 por cá */
  const decimal = /^\d{1,2}$/.test(after);

  const whole = (decimal ? t.slice(0, sep) : t).replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole)) return null;

  return Number(whole) * 100 + (decimal ? Number(after.padEnd(2, '0')) : 0);
}

const EUR = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
});

export const euros = (cents: number) => EUR.format(cents / 100);

const dayOf = (row: DocRow) => {
  const d = row.data?.date;
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? d
    : row.created_at.slice(0, 10);
};

/** O nome no documento raramente é igual ao da ficha: ela escreve
 *  «Charabanc» onde a marca é «Charabanc Aroma». Basta um conter o outro,
 *  com quatro letras pelo menos para não colar tudo a tudo. */
const matches = (brand: string, doc: string) => {
  const [curto, longo] = brand.length <= doc.length ? [brand, doc] : [doc, brand];
  return curto.length >= 4 && longo.includes(curto);
};

export function buildClients(brands: Brand[], docs: DocRow[]): Client[] {
  const found: { key: string; work: Work }[] = [];

  for (const row of docs) {
    const k = key(row.data?.[NAME_FIELD[row.kind]]);
    if (!k) continue;
    found.push({
      key: k,
      work: {
        id: row.id,
        kind: row.kind,
        title: row.title,
        date: dayOf(row),
        cents: toCents(row.data?.[VALUE_FIELD[row.kind]]),
        billable: BILLABLE.includes(row.kind),
      },
    });
  }

  return brands
    .filter((b) => b.stage === 'fechada')
    .map((brand) => {
      const k = key(brand.name);
      const works = found
        .filter((f) => matches(k, f.key))
        .map((f) => f.work)
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        brand,
        works,
        billedCents: works.reduce(
          (sum, w) => sum + (w.billable ? (w.cents ?? 0) : 0),
          0,
        ),
        lastAt: works[0]?.date ?? brand.updated_at.slice(0, 10),
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
