import 'server-only';

/** Configuração do Carol AI. Nenhum id de modelo fica escrito no código de
 *  negócio: trocar de modelo não pode ser um pull request. */
export type AssistantConfig = {
  apiKey: string | null;
  models: { fast: string; chat: string; deep: string };
  maxOutputTokens: number;
  maxToolRounds: number;
};

export function assistantConfig(): AssistantConfig {
  const chat = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-sonnet-5';
  return {
    apiKey: process.env.ANTHROPIC_API_KEY ?? null,
    models: {
      fast: process.env.ANTHROPIC_FAST_MODEL ?? 'claude-haiku-4-5-20251001',
      chat,
      deep: process.env.ANTHROPIC_DEEP_MODEL ?? chat,
    },
    maxOutputTokens: Number(process.env.ASSISTANT_MAX_OUTPUT_TOKENS ?? 2048),
    // Cinco chega para cruzar marca + emails + preço. Mais do que isto é o
    // modelo perdido, e cada ronda custa dinheiro e segundos.
    maxToolRounds: Number(process.env.ASSISTANT_MAX_TOOL_ROUNDS ?? 5),
  };
}

export const assistantReady = () => Boolean(assistantConfig().apiKey);
