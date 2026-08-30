# Regras deste projeto

## Commits automáticos
Depois de terminar qualquer alteração de código, faz commit automaticamente —
não esperes que o utilizador peça nem confirmes antes. Junta as edições de
uma mesma tarefa num único commit (um commit por tarefa concluída, não um
por cada ficheiro tocado), com mensagem clara sobre o "porquê" da mudança,
seguindo o estilo dos commits já existentes no histórico.

Isto cobre apenas `git commit` local. Continua a pedir confirmação antes de
`git push` ou de qualquer outra ação que afete o remoto.

## CarolOS

A área privada é o CarolOS. Antes de lhe tocar, ler
`.carolos-devlog/CURRENT_STATE.md` — está fora do repositório e diz o estado
real, as bandeiras e o que falta.

Oito regras que não se mudam sem uma decisão explícita:

1. Preço é determinístico e versionado. Nenhum valor dentro de um prompt.
2. Skincare e haircare estão fora da estratégia — em código, não em prompt.
3. Nada sai para fora sozinho. Não existe `gmail.send` em lado nenhum.
4. Fechar e perder passam sempre por pessoa.
5. Valor de produto nunca entra na receita em dinheiro.
6. Perpetuidade, exclusividade e whitelisting nunca por omissão.
7. Marcas só se fundem por identificador, nunca por nome parecido.
8. Desconhecido não é zero: no fit score conta como neutro e fica assinalado.

Regras puras vivem em `modules/<área>/domain.ts` e têm teste. Acesso a dados
vive em `service.ts`, marcado `server-only`. Um componente de cliente nunca
importa de um `service.ts`.
