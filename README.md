# portfolio-ugc · CarolOS

Uma aplicação, duas superfícies

- **carolqueiroz.pt**, o portfólio público da Carol;
- **CarolOS**, a área privada de estratégia e produção de conteúdo.

Next.js App Router + TypeScript + Supabase, com deploy na Vercel.

## Escopo atual

O CarolOS foi reduzido de propósito.

A Carol não usava o CRM, inbox, prospecção, funil, dinheiro, pricing, direitos ou a operação comercial que existia antes. Essas superfícies saíram do produto. O que continua é o que ela realmente usa ou decidiu usar agora.

- **Conteúdo** com calendário semanal, Kanban diário e referências salvas;
- **O site** com editor, biblioteca de mídia e links do portfólio público.

Não reintroduza uma área antiga só porque o código histórico ainda existe. Uma feature volta apenas depois de existir uso real para ela.

## Conteúdo

O gerenciador atual usa `content_board_item` e temas centrais gerenciáveis em `content_pillar`. A Carol pode adicionar temas sem novo deploy.

Os quatro temas iniciais são UGC como fonte de renda, Braga a fundo, Casa e rotina e Sobre mim. Cada aplicação de referência define **Tema central, Assunto, Zona e Formato** antes do refinamento do gancho e do roteiro.

As zonas são Z1 Atração, Z2 Retenção, Z3 Conexão e Z4 Comunidade. Elas descrevem a função do conteúdo no perfil pessoal. Tech UGC e Canvas UGC são modalidades comerciais, com foco em SaaS e aplicativos para negócios locais.

Referências analisadas permanecem na área de referências. A Carol revisa a proposta, escolhe a data e cria um rascunho na etapa Ideia. A importação não publica nem preenche o calendário automaticamente.

## Referências do Instagram

A área `/dashboard/content/references` reúne links, legendas, transcrições, leitura das imagens e aplicação prática ao contexto atual da Carol.

O conector acompanha uma coleção escolhida nos Salvos em ciclos com intervalo mínimo de cinco minutos. Pode operar continuamente em um servidor autorizado, com Docker, reinício automático e estado privado persistente. A execução em um computador continua disponível como alternativa. A integração é não oficial e depende de uma sessão válida da própria conta. O CMS usa Supabase Realtime para exibir o material recebido e a evolução da análise. A sessão Instagram fica no dispositivo ou servidor do conector e não é enviada ao CMS.

Também é possível adicionar um link e enviar a mídia diretamente pela interface. Links sem mídia ou texto suficiente continuam identificados como referências que precisam de material.

A busca e os filtros consultam o histórico completo. A interface mostra 60 referências por página e mantém o item aberto enquanto a lista é atualizada.

O contexto vem dos temas ativos, dos conteúdos recentes e de **Minha rotina agora**, editável pela Carol. Transcrição, legenda, texto visível e limitações permanecem separados. A leitura e a análise usam as credenciais de IA já configuradas no servidor.

Consulte o [guia de instalação e operação](docs/instagram-saved-references.md) para configurar o conector. As ferramentas MCP `list_saved_references` e `get_saved_reference` permitem consultar o mesmo material pelo ChatGPT com a sessão do CarolOS.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Gates

```bash
npm run typecheck
npm run lint
npm run test
python3 -B -m unittest discover -s tools/instagram-saves-bridge -p 'test_*.py'
npm run build
```

A avaliação contra modelo real fica fora do CI.

```bash
npm run eval:content
```

## Estrutura principal

```
app/
  page.tsx, contato/            portfólio público
  dashboard/(app)/
    content/                    CarolOS atual
    site/                       editor do site público
  api/
    integrations/instagram/     OAuth, callbacks e webhook da Meta
    references/                 ingestão autenticada e mídia privada
    jobs/[job]/                 rotas históricas, sem reativar agendamentos
    track/                      analytics do site

modules/
  content-brain/                estratégia, prioridade, produção, auditoria, aprendizado
  integrations/instagram/       único cliente da Graph API
  saved-references/             referências, evidência, adaptação e fila
  jobs/                         implementação histórica de agendamentos

lib/
  content-store.ts              conteúdo publicado e rascunho do site
  supabase/                     clientes e tipos

supabase/migrations/            histórico aditivo; migrations antigas não são apagadas
```

## Integrações históricas

A integração Meta e os módulos antigos permanecem no repositório quando removê-los acrescentaria risco. Sua presença não autoriza reabrir áreas nem reativar agendamentos do produto anterior. A coleção privada de Salvos usa o conector isolado descrito acima.

Ausência de métrica continua sendo `NULL`, nunca zero. Trial Reel não é inferido pela API.

## Trabalhos de fundo

Os agendamentos históricos foram desativados na simplificação do CarolOS. Esta alteração mantém essa decisão.

Referências usam uma fila persistente. A ingestão e as consultas autenticadas do CMS acionam o processamento com `after()`, limitado a dois trabalhos simultâneos no banco. Os sinais do conector e novas visitas retomam itens pendentes. Nenhum cron adicional foi criado.

## Banco

Migrações são aditivas e ordenadas.

Não apagar migrations antigas para “limpar” o CRM removido. Elas fazem parte da história da base e precisam continuar reproduzíveis. Código e UI podem desaparecer sem reescrever o passado do banco.

Depois de aplicar novas migrations, regenerar os tipos.

```bash
npm run db:types
```

## Segurança

- nenhum segredo no repositório;
- service role somente no servidor;
- credenciais dos provedores e sessão do Instagram não chegam ao navegador;
- a chave restrita do conector aparece somente no momento em que é gerada;
- a área privada exige sessão;
- nada publica conteúdo automaticamente em nome da Carol;
- o site público lê somente conteúdo publicado.

## Regra de produto

O CarolOS não deve criar manutenção para a Carol.

Se uma feature depender de ela alimentar um sistema por obrigação, ou se não resolver um uso que ela reconhece, ela não entra.
