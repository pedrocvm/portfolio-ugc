# Regras deste projeto

## Commits automáticos

Depois de terminar uma alteração de código, faça um commit por tarefa concluída, com mensagem explicando o porquê. Nunca use Co-Authored-By nem atribuição de IA.

Antes de qualquer push, respeite a autorização explícita da sessão.

## CarolOS

Antes de tocar na área privada, leia `.carolos-devlog/CURRENT_STATE.md`.

### Escopo atual

O CarolOS foi deliberadamente reduzido.

A experiência privada tem apenas:

1. **Conteúdo**
2. **O site**

CRM, Gmail, Conversas, Follow-ups, Marcas, Oportunidades, Prospecção, Clientes, Cases comerciais, Documentos comerciais, Funil, Produção comercial, Dinheiro, pricing, rights, upsell e a antiga Carol AI global **não fazem parte do produto atual**.

Não ressuscite essas áreas sem uma decisão explícita do Pedro baseada em uso real.

Código e migrations históricas podem permanecer quando removê-los acrescentar risco sem valor. Eles não podem voltar a governar navegação, scheduler ou estratégia.

### Conteúdo

A estratégia atual vive em `modules/content-brain/`.

Regras obrigatórias:

- pilares reais: UGC como fonte de renda, Experiências, Casa;
- Tech UGC e Canvas UGC são modalidades comerciais, não formatos;
- foco comercial: SaaS e apps que atendem negócios locais;
- 3 posts por semana é a capacidade padrão;
- documentar a jornada, não transformar a Carol em professora de creators;
- Portugal é contexto, não pilar;
- nada chega a pronto sem validação humana;
- ausência de alternativa não valida formato;
- desconhecido não é zero;
- o Motor de Prioridades é determinístico; IA escreve ângulo e material, não inventa a razão da prioridade;
- aprendizado precisa voltar ao Motor para ter valor.

Não escreva regras editoriais concorrentes em prompts, componentes ou outros módulos.

### Arquitetura

Regras puras ficam em `modules/<área>/domain.ts` ou no arquivo puro equivalente, com teste.

Acesso a dados fica em serviços server-only.

Componente de cliente não importa serviço server-only.

A Graph API do Instagram só é chamada pelo módulo de integração.

### Linguagem

É proibido usar PT-PT na interface ou nos textos gerados para a Carol.

Use sempre português do Brasil.
