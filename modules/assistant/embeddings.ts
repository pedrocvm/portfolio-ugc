import 'server-only';

/** Onde os embeddings vão entrar, quando entrarem.
 *
 *  A coluna `knowledge_chunk.embedding` e o índice HNSW já existem. O que não
 *  existe é um fornecedor: a Anthropic não tem API de embeddings, e meter um
 *  segundo serviço pago só para ter busca semântica seria pagar por estética
 *  quando o FTS em português resolve o que há hoje.
 *
 *  Isto é a costura, não um adiamento: no dia em que houver fornecedor, escreve-
 *  se um `EmbeddingProvider` e `searchKnowledge` passa a híbrido sem mexer em
 *  ferramentas nem em prompts. */

export type EmbeddingProvider = {
  id: string;
  /** Tem de bater com `vector(1536)` na base, ou a migração muda também. */
  dimensions: 1536;
  embed(texts: string[]): Promise<number[][]>;
};

const providers = new Map<string, EmbeddingProvider>();

export function registerEmbeddingProvider(p: EmbeddingProvider) {
  if (p.dimensions !== 1536) {
    throw new Error(`Embeddings: a coluna é vector(1536) e ${p.id} devolve ${p.dimensions}.`);
  }
  providers.set(p.id, p);
}

export function embeddingProvider(): EmbeddingProvider | null {
  const wanted = process.env.EMBEDDING_PROVIDER;
  if (!wanted) return null;
  return providers.get(wanted) ?? null;
}

export const semanticSearchAvailable = () => embeddingProvider() !== null;
