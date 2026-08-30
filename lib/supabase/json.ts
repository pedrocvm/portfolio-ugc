import type { Json } from './database.types';

/** Uma coluna `jsonb` aceita qualquer JSON, mas o tipo gerado é uma união
 *  recursiva que o TypeScript não consegue reconciliar com um
 *  `Record<string, unknown>` vindo de um formulário ou de um schema Zod.
 *  Este é o único ponto onde essa fronteira se atravessa — o valor já foi
 *  validado antes de chegar aqui. */
export const asJson = (value: unknown) => value as Json;
