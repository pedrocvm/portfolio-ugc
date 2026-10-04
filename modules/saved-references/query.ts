import { z } from 'zod';
import { REFERENCE_STATUSES } from './domain';

export const REFERENCE_PAGE_SIZE = 60;
export const referenceQuerySchema = z.object({
  page: z.number().int().min(0).max(Math.floor((Number.MAX_SAFE_INTEGER - REFERENCE_PAGE_SIZE) / REFERENCE_PAGE_SIZE)).default(0),
  search: z.string().max(200).trim().refine((value) => !value.includes('\0'), 'A busca contém um caractere inválido.').default(''),
  status: z.enum([...REFERENCE_STATUSES, 'upload_pending', 'all']).default('all'),
  collection: z.string().max(100).trim().refine((value) => !value.includes('\0'), 'O nome da pasta contém um caractere inválido.').default(''),
}).strict();

export type ReferenceScreenQuery = z.input<typeof referenceQuerySchema>;
export type ParsedReferenceScreenQuery = z.output<typeof referenceQuerySchema>;

const SEARCH_FIELDS = [
  'title', 'caption', 'creator_handle', 'notes', 'analysis->>title', 'analysis->adaptation->>subject',
] as const;

/** A busca é texto literal. imatch evita o alias * -> % de ilike no
 * PostgREST, e todos os metacaracteres de regex são escapados. */
export function literalReferenceSearchPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function referenceSearchFilter(value: string): string {
  const literal = literalReferenceSearchPattern(value);
  // Uma segunda camada protege o valor na gramática OR do PostgREST.
  const quoted = `"${literal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return SEARCH_FIELDS.map((field) => `${field}.imatch.${quoted}`).join(',');
}
