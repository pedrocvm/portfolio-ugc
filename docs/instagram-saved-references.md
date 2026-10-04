# Salvos do Instagram no CarolOS

Carol continua salvando posts no iPhone em uma coleção do Instagram chamada **CarolOS**. Um conector executado no computador dela consulta essa coleção e envia as referências para a área **Referências** do CMS. O CMS recebe a legenda e a mídia disponível, extrai as falas e o conteúdo visual e prepara uma explicação com sugestões para a rotina da Carol.

A consulta ao Instagram acontece a cada cinco minutos, acrescida do tempo de transferência e processamento. O CMS usa atualização em tempo real para mostrar o progresso recebido. **A integração com Salvos é não oficial e não oferece um evento instantâneo a cada salvamento.** Ela precisa de um computador macOS ou Linux ligado, conectado à internet e com o conector em execução. O primeiro login e a aceitação local são feitos pela titular da conta.

## O que está implementado

| Etapa | Comportamento |
| --- | --- |
| Salvar no Instagram | A coleção é escolhida pelo nome exato e vinculada ao ID após o login local. |
| Consultar a coleção | O início da coleção é revisitado em cada ciclo. Uma varredura paginada recupera o histórico e os itens que não cabem nos primeiros 50. |
| Receber no CMS | O link e o identificador do post evitam duplicação. Uploads interrompidos retomam o lote pendente. |
| Ler o conteúdo | O processamento usa os arquivos realmente recebidos. Uma legenda isolada não é tratada como transcrição. |
| Adaptar à Carol | A análise considera **Minha rotina agora**, os temas cadastrados e os conteúdos recentes do calendário. |
| Atualizar a tela | O CMS mostra recebimento, envio pendente, análise e resultado. |

A busca e os filtros percorrem todo o histórico recebido. A lista usa páginas de 60 referências, com contagem da seleção e navegação para os itens anteriores.

O conector envia somente a coleção escolhida. Ele não publica, curte, comenta, envia mensagens, salva novos posts ou altera a conta do Instagram.

## Preparar o CMS

O administrador precisa instalar esta versão do CMS e aplicar a migração `supabase/migrations/20261004170004_carolos_saved_references.sql`. Ela cria as estruturas de referências, conexão, estado de exclusão e armazenamento privado. As permissões de autenticação e as chaves de serviço continuam no servidor do CMS.

As variáveis novas estão em `.env.example`. `CAROLOS_REFERENCES_ENABLED` pode pausar o recurso. A leitura de áudio, vídeo e imagem reaproveita a chave Gemini configurada no CMS. `SAVED_REFERENCES_MEDIA_MODEL` é opcional e permite escolher o modelo dessa leitura. A análise textual usa o provedor de IA já configurado. Essas chaves não são copiadas para o conector.

Sem os provedores necessários, o material continua salvo e a tela informa que a análise ou a transcrição precisa ser ativada. Não é necessário criar um cron com acesso ao Instagram na Vercel. O conector entrega os itens e os sinais de atividade, que também acionam a retomada do processamento persistente no CMS.

## Ativação inicial pela Carol

### 1. Criar a coleção e a chave

No Instagram do iPhone, crie uma coleção nos Salvos chamada **CarolOS** e salve nela um post para o primeiro teste.

No CMS, entre em **Conteúdo → Referências** e abra **Pasta do Instagram**. Informe o mesmo nome da coleção e escolha **Gerar chave de conexão**. A chave aparece nessa sessão para ser copiada. Ela só permite a importação e a confirmação dos arquivos dessa conexão, além de informar o estado do conector.

Em **Minha rotina agora**, registre o contexto que deve orientar as sugestões. Exemplos úteis são o tempo disponível para gravar, os lugares e objetos acessíveis, os temas que quer desenvolver e o que prefere não expor. Quando esse contexto mudar, atualize o campo. Para aplicar a mudança a uma referência anterior, abra o item e escolha **Analisar novamente**.

### 2. Instalar em um ambiente virtual

Requisitos do conector são Python 3.10 ou superior, macOS ou Linux e uma cópia deste repositório. Os comandos abaixo começam na raiz do projeto.

```bash
cd tools/instagram-saves-bridge
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

O arquivo de dependências fixa `instagrapi==3.0.20` e `requests==2.34.2`. O programa recusa uma versão diferente de `instagrapi` para que uma atualização da biblioteca seja revisada antes de alterar a integração.

### 3. Autorizar e conectar localmente

```bash
.venv/bin/python bridge.py setup
.venv/bin/python bridge.py login
```

O comando `setup` explica a integração não oficial e pede que a pessoa digite `ACEITO` antes de fazer a conexão. Em seguida solicita a origem HTTPS do CMS, o nome de usuário no Instagram, o nome exato da coleção e a chave de importação. O endereço deve conter somente o domínio do CMS, como `https://carolqueiroz.pt`.

O comando `login` restaura primeiro uma sessão existente. Quando um login é necessário, a senha é digitada sem aparecer no terminal. A senha não é salva no arquivo de configuração. A conta é conferida pelo nome de usuário e pelo ID, e a coleção é vinculada pelo ID e pelo nome. Se existirem duas coleções com o mesmo nome, o comando solicita o ID da coleção desejada.

Se o Instagram exigir uma verificação, o conector para. A titular resolve a solicitação no aplicativo oficial. Depois disso, ela pode pedir a renovação explícita da sessão.

```bash
.venv/bin/python bridge.py login --renew
```

Quando for solicitado um código legítimo de autenticação de dois fatores, ele pode ser informado localmente com o comando abaixo. O código também não aparece no terminal.

```bash
.venv/bin/python bridge.py login --two-factor
```

O conector não resolve desafios automaticamente, não altera a senha e não oferece opções para contornar captcha, checkpoint ou bloqueios da conta. Uma sessão rejeitada durante a sincronização exige ação local, sem tentativa automática de entrar novamente com a senha.

### 4. Conferir uma consulta e manter ativo

```bash
.venv/bin/python bridge.py once
.venv/bin/python bridge.py run
```

`once` executa uma consulta e processa até dez referências pendentes. `run` mantém os ciclos ativos. O terminal informa quantos itens foram descobertos, confirmados no CMS e deixados pendentes. A confirmação indica que o CMS recebeu o material, enquanto a análise pode continuar na fila do servidor.

Para parar, pressione `Ctrl+C`. O progresso permanece salvo. Executar `run` novamente retoma a fila. O iPhone continua sendo usado normalmente para salvar novos posts na coleção escolhida. Fechar o processo, desligar o computador ou deixá-lo sem rede interrompe as consultas até o próximo início.

## Onde os dados ficam

O estado local fica, por padrão, em `~/.local/share/carolos/instagram-saves`, fora do repositório. O diretório tem permissão `0700`; os arquivos de configuração, sessão, SQLite e trava têm permissão `0600`. Eles devem ser acessíveis somente à conta local que executa o programa. Essas permissões não são criptografia do disco.

| Dado | Destino |
| --- | --- |
| Senha e código de dois fatores | Usados no login local com o Instagram, sem persistência nos arquivos do conector. |
| Sessão do Instagram | Arquivo privado no computador da titular. |
| Chave de importação | Arquivo privado local ou variável de ambiente `CAROLOS_REFERENCE_TOKEN`. |
| Cursor, fila e confirmações | SQLite local para retomar consultas e evitar reenvios. |
| Link, legenda, autor e mídia selecionada | CMS e processamento de IA configurado nele. |
| Arquivos de transferência | Temporários locais, apagados ao terminar ou no próximo início depois de uma interrupção abrupta. |

A sessão do Instagram e a chave de importação não devem ser publicadas, anexadas a chamados ou copiadas para a Vercel. Se `CAROLOS_REFERENCE_TOKEN` estiver definida durante `setup`, seu valor é usado sem ser gravado na configuração. Para trocar a chave, gere uma nova no CMS e execute `setup` novamente com a mesma conta e coleção. Atualize também a variável de ambiente caso ela esteja em uso.

Para escolher outro diretório privado, a opção deve vir antes do comando.

```bash
.venv/bin/python bridge.py --state-dir /caminho/privado/carolos setup
.venv/bin/python bridge.py --state-dir /caminho/privado/carolos login
.venv/bin/python bridge.py --state-dir /caminho/privado/carolos run
```

O programa recusa um diretório dentro de qualquer repositório Git e impede duas execuções simultâneas sobre a mesma pasta. Uma configuração já vinculada não muda silenciosamente de conta, CMS ou coleção. Para uma identidade diferente, use outro diretório de estado e preserve o histórico anterior.

## Prazos, histórico e limites

Cada ciclo consulta até os primeiros 50 itens, limitado a quatro páginas nessa visita, e avança uma página adicional da varredura completa. Quando a varredura termina, ela começa outra passagem. O cursor e os itens de cada página são guardados na mesma transação. Assim, o conector pode retomar uma coleção grande e recuperar mais de 50 novos salvamentos sem encerrar a busca ao encontrar um post conhecido.

O intervalo mínimo é de 300 segundos, com uma variação de até 30 segundos. Ele é contado depois do trabalho do ciclo. Falhas temporárias ampliam a espera até uma hora. Coleções grandes, muitos posts novos e vídeos longos demoram mais para ficar completos no CMS. A data do post é guardada como data de publicação; ela não é apresentada como o momento em que Carol salvou o conteúdo.

São enviados até dez arquivos por referência, com limite de 50 MiB por arquivo e 80 MiB no conjunto. Um carrossel maior recebe uma nota sobre os arquivos omitidos. Formatos não suportados e arquivos acima do limite também geram uma observação para a análise. A referência pode então usar o texto e as mídias válidas que chegaram.

Os downloads usam somente URLs HTTPS de `cdninstagram.com`, `fbcdn.net` ou seus subdomínios. Cada redirecionamento é validado antes de outra conexão. O tamanho real e a assinatura do arquivo são conferidos. Endereços locais e respostas DNS com endereços privados são recusados. A conexão usa o IP público validado, com verificação TLS para o domínio original.

O envio ao Storage usa a origem informada pelo CMS autenticado no setup e fixada na configuração local. O destino assinado precisa corresponder à origem, ao caminho e ao token esperado. A chave do CMS só vai para a rota de importação do próprio CMS. Downloads e uploads não recebem esse cabeçalho e o envio ao CMS ou ao Storage não segue redirecionamentos.

Cada requisição de transferência é encerrada após 180 segundos contados depois da conexão TLS, inclusive se o servidor responder ou receber bytes lentamente. A conexão TCP tem limite de 15 segundos e as operações de socket usam 45 segundos. A resolução DNS segue a configuração do sistema operacional.

## Interrupções e exclusões

Se um download, upload ou confirmação falhar, o item continua na fila local. Uma resposta perdida não provoca outra referência no CMS. O reenvio usa o mesmo link e o mesmo identificador do post; arquivos que já chegaram são conferidos pelo servidor e o lote só é concluído depois da validação.

Uma mídia que retorna indisponibilidade ou acesso recusado permanece pendente. As próximas páginas da coleção podem renovar a URL de download. Se o conteúdo foi apagado ou deixou de ser acessível, o conector não consegue recuperar seus bytes e pode manter o item pendente indefinidamente. O aviso continua aparecendo no estado da conexão durante a espera. Nesse caso, a titular pode conferir o post no Instagram ou adicionar manualmente ao CMS o material ao qual ainda tem acesso.

Tirar um post dos Salvos não remove a referência já recebida no CMS. Ao excluir uma referência no CMS, o servidor guarda a exclusão para impedir que a coleção a importe novamente. A fila local também conserva os identificadores confirmados. Para recuperar uma referência excluída por decisão da titular, ela pode adicioná-la novamente pela interface do CMS.

Renomear a coleção ou mudar o nome de usuário no Instagram faz a validação parar. Isso evita continuar importando de uma pasta diferente. Pausar a conexão ou substituir a chave no CMS também impede novas entregas até a configuração local ser ajustada.

Uma URL de upload já emitida pelo Storage conserva seu prazo de validade mesmo depois de a chave ser substituída. A conclusão do lote no CMS continua exigindo uma conexão autorizada e o identificador correto do envio. Pausar o conector antes de remover a configuração evita transferências ainda em andamento.

## Verificação técnica

Os testes não precisam de dependências de terceiros, internet ou conta do Instagram.

```bash
python3 -B -m unittest discover -s tools/instagram-saves-bridge -p 'test_*.py' -v
```

Foram verificados offline o contrato de importação, a sessão restaurada antes de consultas, a interrupção em verificações do Instagram, as permissões locais, a paginação após muitos salvamentos, a atomicidade da fila, a recuperação de ACK perdido, os lotes de upload, os estados de exclusão e as restrições de rede. A revisão também cobriu a permanência do aviso de mídia pendente durante o backoff e o encerramento de transferências lentas.

### Validação da implementação em 4 de outubro de 2026

- Typecheck, ESLint e compilação de produção concluídos sem erros.
- Suíte JavaScript com 1.286 testes, dos quais 1.280 passaram e seis testes de integração existentes ficaram ignorados por ausência das credenciais do ambiente descartável.
- Os 44 testes Python do conector passaram sem login e sem dependências externas.
- A migration foi executada primeiro em PostgreSQL embarcado e depois aplicada ao Supabase do projeto. Uma verificação transacional no banco real confirmou permissões, RLS, Realtime, rotação do hash do token, limite de dois trabalhos, proteção por lease, criação idempotente de rascunho em Ideia e exclusão que preserva o calendário e impede reimportação. Toda a transação de teste foi revertida. As tabelas novas continuaram sem referências e sem conexão ativa.
- O servidor local de produção passou seis verificações HTTP de autenticação, método permitido, acesso à mídia e abertura da página de login.
- A sintaxe da busca foi aceita pelo PostgREST real. As consultas anônimas, incluindo caracteres especiais, foram recusadas pelas permissões da tabela como esperado.
- A identidade visual foi revisada no código, usando os mesmos tokens e fontes do dashboard. A validação visual em navegador ficou pendente porque o ambiente bloqueou os sockets do navegador e sua política recusou execução com permissões adicionais. Os dados fictícios usados na preparação dessa verificação e a opção temporária de preview foram removidos da implementação.

**O login e a sincronização com a conta real da Carol ainda precisam ser validados no computador autorizado por ela.** Nenhuma credencial do Instagram foi usada na implementação. A instalação das dependências no ambiente de desenvolvimento não se concluiu porque a autorização de rede foi cancelada antes da decisão, por isso o teste com a biblioteca instalada também permanece pendente. Os testes offline não garantem que o Instagram aceitará uma sessão real ou manterá os endpoints da integração não oficial.

A extração de mídia e a resposta estruturada do modelo foram verificadas com respostas controladas nos testes. Uma transcrição com o provedor real continua pendente até a ativação e o primeiro envio autorizado.

## Fontes e decisão de integração

Verificação técnica realizada em 4 de outubro de 2026.

- A [documentação de webhooks do Instagram da Meta](https://developers.facebook.com/documentation/instagram-platform/webhooks) não documenta um evento para salvar em uma coleção privada nem uma interface para ler essa coleção. Essa ausência na API documentada impede tratar o fluxo como sincronização oficial instantânea.
- A [documentação de coleções do instagrapi](https://subzeroid.github.io/instagrapi/latest/usage-guide/collection/) descreve a leitura paginada usada pelo conector. Ela fornece uma implementação não oficial, sujeita a alterações e restrições do Instagram.
- As [interações e sessões do instagrapi](https://subzeroid.github.io/instagrapi/latest/usage-guide/interactions/) documentam a restauração de configurações, o login e a autenticação de dois fatores. O conector restringe esses recursos ao processo local e interrompe a execução diante de desafios.
- As versões fixadas foram verificadas nas páginas primárias de [instagrapi no PyPI](https://pypi.org/project/instagrapi/3.0.20/) e [Requests no PyPI](https://pypi.org/project/requests/2.34.2/).
- O upload utiliza o contrato de [upload assinado do Supabase](https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl), com confirmação posterior dos objetos no servidor.

A implementação preserva o hábito de salvar pelo iPhone mediante ativação local explícita. A disponibilidade contínua depende da conta, da sessão e do computador que executa o conector.
