import 'server-only';

import { aiSetup } from '@/modules/ai/provider';

/** Configuração do Carol AI. Nenhum id de modelo fica escrito no código de
 *  negócio: trocar de modelo não pode ser um pull request. */
export type AssistantConfig = {
  /** Só diz se há credencial. A chave em si nunca sai do fornecedor. */
  apiKey: string | null;
  missing?: string | null;
  models: { fast: string; chat: string; deep: string };
  maxOutputTokens: number;
  maxToolRounds: number;
};

export function assistantConfig(): AssistantConfig {
  // Quem responde vem da camada de fornecedor; aqui só ficam os tectos.
  const setup = aiSetup();
  return {
    apiKey: setup.provider ? 'configurado' : null,
    missing: setup.missing,
    models: setup.models,
    maxOutputTokens: Number(process.env.ASSISTANT_MAX_OUTPUT_TOKENS ?? 2048),
    // Cinco chega para cruzar marca + emails + preço. Mais do que isto é o
    // modelo perdido, e cada ronda custa dinheiro e segundos.
    maxToolRounds: Number(process.env.ASSISTANT_MAX_TOOL_ROUNDS ?? 5),
  };
}

export const assistantReady = () => Boolean(assistantConfig().apiKey);
