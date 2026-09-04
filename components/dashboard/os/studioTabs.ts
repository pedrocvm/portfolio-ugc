/** As cinco abas do Conteúdo, num módulo sem diretiva.
 *
 *  Vivia dentro do componente de cliente, e a página — um Server Component —
 *  chamava `isStudioTab()` para escolher a aba inicial. O Next não deixa um
 *  servidor chamar uma função exportada de um módulo `'use client'`: rebentava
 *  ao renderizar e caía no error boundary com «Não consegui ler o conteúdo
 *  salvo». Aqui é uma tabela, e pode ser lida dos dois lados. */
export const STUDIO_TABS = ['record', 'tests', 'published', 'bank', 'strategy'] as const;
export type StudioTab = (typeof STUDIO_TABS)[number];

export const STUDIO_TAB_LABEL: Record<StudioTab, string> = {
  record: 'Para gravar',
  tests: 'Testes',
  published: 'Publicado',
  bank: 'Banco',
  strategy: 'Estratégia',
};

export const isStudioTab = (v: string | undefined): v is StudioTab => (STUDIO_TABS as readonly string[]).includes(v ?? '');
