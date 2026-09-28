# Regras deste projeto

## Commits automáticos

Depois de terminar uma alteração de código, faz commit automaticamente. Agrupa
a mesma tarefa num commit coerente e não adiciona `Co-Authored-By` nem
atribuição de IA.

Não faz push, merge ou alteração destrutiva sem que a sessão tenha autorização
explícita para isso.

## Fonte de verdade atual

Antes de tocar no CarolOS, lê `docs/content-os/DECISIONS.md`.

O produto privado foi deliberadamente reduzido em setembro de 2026. Não
reintroduzir CRM, Gmail, prospecção, receita, oportunidades, follow-ups,
settings operacionais ou o Content Brain antigo só porque o código histórico
ainda existe no repositório.

A superfície usada pela Carol é:

- Conteúdo
- O site

Conteúdo começa pela Semana. O sistema prepara poucas decisões e Carol valida.
O site é o gerenciador do portfólio público e deve continuar funcionando.

## Regras editoriais atuais

1. Os três pilares são Transformando UGC em fonte de renda, Experiências e Casa.
2. SaaS/apps para negócios locais é foco comercial, não quarto pilar.
3. Tech UGC e Canvas UGC começam com o mesmo peso.
4. UGC tradicional não é prioridade.
5. Carol documenta a própria jornada. Não transformar o perfil em aula para creators.
6. Portugal é contexto de vida, não pauta automática sobre “morar em Portugal”.
7. A capacidade sustentável é 3 posts por semana.
8. O calendário é proposto pelo CarolOS e validado pela Carol.
9. Roteiro só nasce depois da validação de assunto, ângulo e formato.
10. Um ou dois posts não validam formato.
11. Reel Test é ferramenta de experimento, não destino automático.
12. Interação significativa, interesse de marcas, seguidores e alcance pesam mais que Views isoladas.

## Arquitetura

Regras puras vivem em `modules/<area>/domain.ts` e têm teste.

Acesso a dados vive em `service.ts` e é server-only.

Componentes de cliente não importam services server-only.

Cálculos determinísticos não são delegados à IA. A IA recebe fatos e contexto
estruturado para tarefas semânticas.

Mudanças de banco são migrations aditivas em `supabase/migrations/`. Nunca
resetar a base nem apagar histórico como atalho.

É proibido usar PT-PT. Toda interface e copy do CarolOS usam PT-BR.
