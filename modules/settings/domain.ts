/** Saúde das integrações, sem tocar na base de dados.
 *
 *  Só os campos que podem ser mostrados: o que salva tokens fica no service. */
export type IntegrationHealth = {
  /** Identifica a caixa nas ações da UI. Vazio no resumo agregado. */
  id: string;
  provider: string;
  account: string;
  status: 'connected' | 'error' | 'revoked' | 'paused' | 'disconnected';
  scopes: string[];
  cursor: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
};

export const blankHealth = (provider: string): IntegrationHealth => ({
  id: '',
  provider,
  account: '',
  status: 'disconnected',
  scopes: [],
  cursor: null,
  lastSyncAt: null,
  lastSuccessAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
});

/** Resumo de todas as caixas, para os avisos que só querem saber se há algo
 *  partido. A pior situação manda: uma caixa em erro entre duas não pode
 *  aparecer como «ligado», senão o aviso nunca chega a quem o precisa de ver. */
export function summariseHealth(all: readonly IntegrationHealth[], provider: string): IntegrationHealth {
  if (all.length === 0) return blankHealth(provider);

  const worst =
    all.find((c) => c.status === 'error') ??
    all.find((c) => c.status === 'revoked') ??
    all.find((c) => c.status === 'paused') ??
    all.find((c) => c.status === 'disconnected') ??
    all[0];

  return {
    ...worst,
    id: '',
    account: all.length === 1 ? worst.account : `${all.length} contas`,
    // A mais recente das caixas: se uma sincronizou há um minuto, o sistema
    // não está parado, mesmo que a outra esteja atrasada.
    lastSuccessAt: all.map((c) => c.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null,
  };
}
