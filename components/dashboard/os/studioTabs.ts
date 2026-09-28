/** As abas do Conteúdo, num módulo sem diretiva.
 *
 *  Vivia dentro do componente de cliente, e a página — um Server Component —
 *  chamava `isStudioTab()` para escolher a aba inicial. O Next não deixa um
 *  servidor chamar uma função exportada de um módulo `'use client'`: rebentava
 *  ao renderizar e caía no error boundary com «Não consegui ler o conteúdo
 *  salvo». Aqui é uma tabela, e pode ser lida dos dois lados.
 *
 *  Cinco destinos, e a ordem é a das perguntas que ela faz: o que fazemos
 *  agora, sobre o que eu falo, o que está pronto, o que ainda não sabemos, o
 *  que funcionou. Referências vivem no Laboratório e aprendizados na
 *  Auditoria — nenhum dos dois é um sexto destino. */
export const STUDIO_TABS = ['week', 'map', 'production', 'lab', 'audit'] as const;
export type StudioTab = (typeof STUDIO_TABS)[number];

export const STUDIO_TAB_LABEL: Record<StudioTab, string> = {
  week: 'Semana',
  map: 'Mapa',
  production: 'Produção',
  lab: 'Laboratório',
  audit: 'Auditoria',
};

export const STUDIO_TAB_QUESTION: Record<StudioTab, string> = {
  week: 'O que fazemos agora?',
  map: 'Sobre o que eu falo?',
  production: 'O que está pronto e o que falta executar?',
  lab: 'O que ainda precisamos descobrir?',
  audit: 'O que funcionou e o que aprendemos?',
};

export const isStudioTab = (v: string | undefined): v is StudioTab => (STUDIO_TABS as readonly string[]).includes(v ?? '');

/** Os nomes antigos continuam a responder: há links guardados e o Hoje ainda
 *  aponta para alguns. Um `?tab=record` abre a Produção em vez de cair na
 *  Semana por omissão. */
const LEGACY: Record<string, StudioTab> = {
  record: 'production',
  tests: 'lab',
  published: 'audit',
  bank: 'map',
  strategy: 'map',
};

export const resolveTab = (v: string | undefined): StudioTab =>
  isStudioTab(v) ? v : (LEGACY[v ?? ''] ?? 'week');
