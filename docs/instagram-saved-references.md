# Salvos do Instagram no CarolOS

Carol continua salvando posts no iPhone, na coleção **Referências UGC** da conta **@carolxqueiroz**. Um conector executado no servidor autorizado da Hetzner consulta essa coleção e envia as referências para a área **Referências** do CMS. O CMS recebe a legenda e a mídia disponível, extrai as falas e o conteúdo visual e prepara uma explicação com sugestões para a rotina da Carol.

Depois da instalação e do primeiro login, a operação diária acontece no servidor. Os computadores do Pedro e da Carol podem ficar desligados. O conector inicia novamente quando o servidor ou o processo reinicia e conserva a fila em um volume próprio. Uma verificação exigida pelo Instagram interrompe a consulta até uma ação autorizada, mesmo após reiniciar o servidor.

O intervalo mínimo entre ciclos é de cinco minutos, acrescido do tempo de transferência e processamento. O CMS usa atualização em tempo real para mostrar o progresso recebido. **A integração com Salvos é não oficial e não oferece um evento instantâneo a cada salvamento.** A disponibilidade depende do servidor, da rede e da sessão aceita pelo Instagram. A titular autoriza a instalação e faz o primeiro login por uma sessão SSH interativa.

O modo local em macOS ou Linux continua disponível como alternativa. Ele depende de o computador escolhido permanecer ligado e conectado. Não é necessário concluir a instalação no Mac do Pedro para usar a Hetzner.

## O que está implementado

| Etapa | Comportamento |
| --- | --- |
| Salvar no Instagram | A coleção é escolhida pelo nome exato e vinculada ao ID após o primeiro login. |
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

## Ativação inicial

### 1. Conferir a coleção e a chave no CMS

No Instagram do iPhone, abra a coleção **Referências UGC** da conta **@carolxqueiroz** e salve nela um post para o primeiro teste. Se ainda não existir, crie uma coleção nos Salvos com esse nome. O nome precisa coincidir com o informado no conector e no CMS.

No CMS, entre em **Conteúdo → Referências** e abra **Pasta do Instagram**. Informe **Referências UGC** e escolha **Gerar chave de conexão**. A chave aparece nessa sessão para ser copiada. Ela só permite a importação e a confirmação dos arquivos dessa conexão, além de informar o estado do conector.

Se a chave já foi gerada durante a tentativa de configuração no Mac, é possível informar a mesma chave no servidor autorizado. Se ela não estiver mais disponível para copiar, gere uma nova no CMS. Isso revoga a chave anterior. Deixe apenas uma instalação ativa para essa conta e coleção.

Em **Minha rotina agora**, registre o contexto que deve orientar as sugestões. Exemplos úteis são o tempo disponível para gravar, os lugares e objetos acessíveis, os temas que quer desenvolver e o que prefere não expor. Quando esse contexto mudar, atualize o campo. Para aplicar a mudança a uma referência anterior, abra o item e escolha **Analisar novamente**.

### 2. Preparar o serviço na Hetzner

Use um servidor Linux autorizado com Docker Engine, Docker Compose v2 e Git disponíveis. A instalação fica em `/opt/carolos-instagram-saves`, em um projeto Compose chamado `carolos-instagram-saves`, com somente o serviço `instagram-saves`. O serviço não publica portas nem oferece um endereço HTTP. Não é necessário alterar o Compose de outros produtos hospedados no mesmo servidor.

O container fornece Python 3.12 e as dependências do conector. Ele não usa o Python instalado no Mac nem altera o Python de outros serviços. A pasta do projeto contém apenas o necessário para executar o conector. O CMS continua em sua infraestrutura atual.

O Compose limita o processo de sincronização a 512 MiB de memória, metade de uma CPU e 128 processos. Os logs têm rotação de três arquivos de até 10 MB. Esses limites valem para o serviço em execução. A construção da imagem usa recursos do Docker no servidor e precisa de espaço disponível para baixar e instalar as dependências.

A configuração, a sessão do Instagram e a fila ficam em um volume nomeado exclusivo, montado em `/state`. Os comandos de configuração e o processo contínuo usam esse mesmo volume. Não copie a sessão do Instagram para o repositório, para variáveis da Vercel ou para o CMS.

A instalação e os comandos de administração são feitos no servidor por SSH. Disponibilize uma cópia revisada do repositório no servidor. A partir da raiz dessa cópia, execute primeiro a conferência de requisitos. O instalador precisa de permissão administrativa para escrever em `/opt` e acessar o Docker. Se a sessão já usa `root`, omita `sudo`.

```bash
sudo bash tools/instagram-saves-bridge/install-server.sh --check
```

Esse comando confere o ambiente sem instalar o serviço. Ele exige pelo menos 1 GiB de memória disponível e 3 GiB livres em `/opt` para continuar. Para a instalação, use `--ref` com o SHA completo do commit publicado e revisado. Substitua `SHA_DO_COMMIT_PUBLICADO` pelo identificador dessa versão.

```bash
sudo bash tools/instagram-saves-bridge/install-server.sh --ref SHA_DO_COMMIT_PUBLICADO
```

O instalador prepara a pasta dedicada a partir da versão escolhida, constrói a imagem e confere a importação das dependências sem acessar o Instagram. Quando os arquivos de configuração ou sessão ainda não existem, solicita a autorização, a configuração e o login em um terminal interativo. Depois, inicia o serviço. Ele verifica a propriedade da instalação antes de atualizar um diretório existente e preserva o volume de estado.

Se Docker, Compose ou os demais requisitos estiverem ausentes, configure-os pelo procedimento de administração já usado nesse servidor antes de tentar novamente. A implantação deste conector não instala uma segunda infraestrutura do CMS e não altera o ambiente dos outros produtos.

As etapas seguintes explicam os prompts e os comandos individuais usados na ativação. Se o instalador já concluiu uma etapa, não é necessário repeti-la. Todos os comandos Compose abaixo partem do diretório dedicado e pressupõem acesso ao Docker. Use `sudo` antes de `docker` se esse acesso exigir permissão administrativa.

```bash
cd /opt/carolos-instagram-saves
docker compose build
```

Quando executar de outro diretório, informe explicitamente o projeto e o arquivo de configuração.

```bash
docker compose --project-name carolos-instagram-saves -f /opt/carolos-instagram-saves/compose.yaml ps
```

### 3. Autorizar e fazer o primeiro login

O instalador conduz esta etapa quando ainda não existem os arquivos de configuração ou sessão. Uma sessão já existente que precisa de renovação segue os comandos de recuperação, sem ser renovada automaticamente pelo instalador. Para executá-la manualmente, mantenha o serviço parado e use os comandos interativos.

```bash
docker compose run --rm -i instagram-saves setup
docker compose run --rm -i instagram-saves login
```

O comando `setup` explica a integração não oficial e pede que a pessoa digite `ACEITO`. Informe `https://carolqueiroz.pt` como endereço do CMS, `carolxqueiroz` como usuário, `Referências UGC` como coleção e a chave de importação gerada no CMS. O endereço deve conter somente a origem HTTPS, sem caminhos adicionais.

A chave é digitada no prompt privado, sem aparecer no terminal. Não coloque a chave ou a senha em argumentos de comandos, exemplos de Compose, mensagens, capturas de tela ou arquivos versionados.

O comando `login` restaura primeiro uma sessão existente. Quando um login é necessário, a senha é digitada sem aparecer no terminal. A senha não é salva no arquivo de configuração. A conta é conferida pelo nome de usuário e pelo ID, e a coleção é vinculada pelo ID e pelo nome. Se existirem duas coleções com o mesmo nome, o comando solicita o ID da coleção desejada.

Se o Instagram exigir uma verificação, o conector para. A Carol resolve a solicitação no aplicativo oficial e então autoriza uma nova tentativa de login no servidor.

```bash
docker compose run --rm -i instagram-saves login --renew
```

Quando o login exigir um código legítimo de autenticação de dois fatores, use a opção abaixo. O código é solicitado de forma privada durante o comando.

```bash
docker compose run --rm -i instagram-saves login --two-factor
```

O conector não resolve desafios automaticamente, não altera a senha e não oferece opções para contornar captcha, checkpoint ou bloqueios. Não há um novo login automático com senha em caso de falha da sessão. A instalação em um servidor não garante que o Instagram aceitará o login dessa conta.

### 4. Validar um envio e deixar automático

Se o instalador já deixou o serviço em execução, acompanhe o primeiro ciclo pelos logs e pelo CMS. Para fazer uma consulta manual controlada, pare o serviço antes de executar `once` e ligue-o novamente ao terminar.

```bash
docker compose stop instagram-saves
docker compose run --rm -i instagram-saves once
docker compose up -d
```

`once` executa uma consulta e processa até dez referências pendentes. Confirme que o post salvo na coleção aparece no CMS e que a transcrição e a proposta correspondem ao material recebido. A confirmação do conector significa que o CMS recebeu o material. A análise pode continuar na fila do servidor.

`docker compose up -d` inicia o modo `serve` em segundo plano. Depois disso, é possível fechar o terminal SSH e desligar o computador. O serviço continua consultando a coleção na Hetzner, retoma a fila após interrupções e inicia novamente com o Docker. O Docker precisa estar habilitado para iniciar com o servidor.

Acompanhe o estado e as últimas mensagens sem exibir credenciais.

```bash
docker compose ps
docker compose run --rm -T instagram-saves status
docker compose logs --tail 100 instagram-saves
```

O comando `status` lê somente o estado local do serviço. Ele não solicita a senha e não consulta o Instagram. Pode ser executado enquanto `serve` está ativo. O primeiro sinal do conector, o último envio e os avisos recebidos também aparecem em **Pasta do Instagram**, no CMS.

Se o serviço foi parado manualmente, ele continua parado até `docker compose up -d`, inclusive após um reinício do servidor. Esse comportamento segue a [política `unless-stopped` do Docker](https://docs.docker.com/engine/containers/start-containers-automatically/).

A indicação de processo iniciado não comprova uma sincronização concluída. Antes de considerar a ativação terminada, confira a sessão aceita pelo Instagram, um sinal recente no CMS, a chegada do post de teste e o resultado da análise. O login e o primeiro envio reais só estão validados depois dessas etapas.

## Administração do serviço

### Interromper sem apagar o progresso

```bash
cd /opt/carolos-instagram-saves
docker compose stop instagram-saves
```

Para voltar a executar, use `docker compose up -d`. A fila e a sessão permanecem no volume. Reiniciar não libera um bloqueio que exige ação humana.

Não use `docker compose down --volumes` para uma reinicialização ou atualização. Essa opção apaga o volume do serviço e pode remover configuração, sessão e progresso. O diretório `/state` também não deve ser limpo como tentativa de resolver falhas.

### Recuperar um bloqueio

Falhas de sessão do Instagram, conta, coleção ou configuração ficam registradas em `/state`. O modo `serve` permanece aguardando intervenção e não repete o login. Reinícios do processo, do container e do servidor conservam esse bloqueio. Falhas temporárias de rede seguem a espera progressiva e retomam sem interação.

Leia `status` e o aviso no CMS para identificar a ação necessária. Se o Instagram pediu uma verificação, resolva primeiro no aplicativo oficial. Depois, pare o serviço e renove a sessão explicitamente.

```bash
docker compose stop instagram-saves
docker compose run --rm -i instagram-saves login --renew
docker compose up -d
```

Para uma falha já corrigida que não exige novo login, a retomada usa a sessão salva.

```bash
docker compose stop instagram-saves
docker compose run --rm -i instagram-saves resume
docker compose up -d
```

`resume` exige um terminal interativo e a confirmação `RETOMAR`. O comando confere o CMS, a sessão existente, a conta e a coleção antes de liberar o bloqueio. Ele não tenta entrar novamente com a senha. Se uma validação falhar, o bloqueio continua registrado.

O serviço parado pode aparecer como indisponível até o próximo `up -d`. Se a conexão também estiver pausada no CMS, reative-a antes de pedir a retomada. Uma chave revogada precisa ser substituída na configuração do conector.

### Pausar e retomar pelo CMS

Use **Pausar sincronização** em **Pasta do Instagram** para interromper novas entregas. Quando o CMS recusa a conexão, o serviço passa a conferir somente a autorização do CMS, com intervalo mínimo de cinco minutos e espera maior diante de falhas temporárias. Durante essa espera, ele não consulta o Instagram.

Depois de usar **Retomar sincronização** no CMS, a operação volta automaticamente na próxima confirmação da autorização, desde que a chave continue válida. Uma pausa simples não exige entrar por SSH. Esse procedimento não libera verificações do Instagram ou bloqueios de sessão. Esses casos continuam exigindo a ação descrita na seção anterior.

### Trocar a chave do CMS

Gere uma nova chave em **Pasta do Instagram**, pare o serviço e execute `setup` com a mesma conta, coleção e origem do CMS. Informe a nova chave somente no prompt privado. Depois, valide a retomada e inicie o serviço.

```bash
docker compose stop instagram-saves
docker compose run --rm -i instagram-saves setup
docker compose run --rm -i instagram-saves resume
docker compose up -d
```

A configuração não troca silenciosamente a identidade já vinculada. Alterar conta ou coleção exige uma instalação planejada com outro estado. Não edite os identificadores à mão e não apague a fila para forçar a mudança.

### Atualizar a versão

Atualize apenas os arquivos desta instalação dedicada, preservando o volume. Com os arquivos revisados disponíveis no servidor, execute a reconstrução e substitua o container.

```bash
docker compose build
docker compose up -d
docker compose run --rm -T instagram-saves status
docker compose logs --tail 100 instagram-saves
```

Não use comandos de limpeza geral do Docker no servidor compartilhado. A atualização deste conector não exige reiniciar outros projetos ou abrir portas.

### Interpretar o monitoramento

O comando `status` informa o estado do serviço sem consultar serviços externos. Seus códigos de saída ajudam a diferenciar uma pendência que exige ação de um processo parado.

| Código de saída | Significado |
| --- | --- |
| `0` | O processo está ativo e o estado recente permite a operação. |
| `2` | O serviço aguarda configuração, login ou resolução de um bloqueio. |
| `1` | O processo está parado ou o estado não pôde ser validado. |

O container também faz uma verificação interna com `status --healthcheck`. A integração com o Docker usa saída `0` para sucesso e `1` para falha, conforme o [contrato de verificação de saúde do Docker](https://docs.docker.com/reference/dockerfile/#healthcheck).

Um container marcado como `unhealthy` precisa ser inspecionado. Essa indicação, por si só, não executa um novo login nem apaga o estado. A retomada de uma verificação do Instagram continua exigindo intervenção autorizada.

## Alternativa no computador da Carol

Esta opção é útil quando a titular prefere manter a sessão no próprio computador. Para usar a Hetzner, não é necessário executar estas etapas no Mac do Pedro.

Requisitos do modo local são Python 3.10 ou superior, macOS ou Linux e uma cópia deste repositório. Os comandos abaixo começam na raiz do projeto.

```bash
cd tools/instagram-saves-bridge
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py setup
.venv/bin/python bridge.py login
.venv/bin/python bridge.py once
.venv/bin/python bridge.py run
```

`run` mantém os ciclos enquanto o processo estiver ativo. Para parar, pressione `Ctrl+C`. O progresso permanece salvo. Executar `run` novamente retoma a fila. Fechar o processo, desligar o computador ou deixá-lo sem rede interrompe as consultas.

A renovação explícita de sessão usa `.venv/bin/python bridge.py login --renew`. Quando solicitado pelo Instagram, o código de autenticação de dois fatores pode ser informado com `.venv/bin/python bridge.py login --two-factor`.

### Quando o ambiente virtual fica sem pip

O módulo [venv do Python](https://docs.python.org/3.14/library/venv.html) chama `ensurepip` para instalar `pip` no ambiente virtual. Uma falha nessa etapa de `python3 -m venv .venv` pode deixar o interpretador do ambiente criado sem instalar `pip`. Isso explica a mensagem `No module named pip`. O erro apresentado, sozinho, não demonstra incompatibilidade do conector com Python 3.14.

O `setup` usa a biblioteca padrão do Python e pode salvar a configuração mesmo sem as dependências de login. Por isso a configuração feita no Mac pode ter sido concluída enquanto o login continuou indisponível. Configuração concluída não significa conta conectada.

Se a escolha for continuar com o modo local e o interpretador de `.venv` existir, tente instalar o `pip` nesse ambiente pelo módulo [ensurepip do Python](https://docs.python.org/3.13/library/ensurepip.html) e então as dependências.

```bash
.venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install -r requirements.txt
```

Se `ensurepip` continuar falhando, preserve a mensagem completa para corrigir a instalação do Python antes do login. Não instale os pacotes globalmente como solução. O container da Hetzner tem seu próprio Python 3.12 e não depende desse reparo.

O arquivo de dependências fixa `instagrapi==3.0.20` e `requests==2.34.2`. O programa recusa uma versão diferente de `instagrapi` para que uma atualização da biblioteca seja revisada antes de alterar a integração.

## Onde os dados ficam

Na Hetzner, o estado fica em `/state`, dentro do volume privado exclusivo do conector. No modo local, o padrão é `~/.local/share/carolos/instagram-saves`, fora do repositório. O diretório tem permissão `0700`; os arquivos de configuração, sessão, SQLite e trava têm permissão `0600`. Eles devem ser acessíveis somente à conta que executa o programa e aos administradores autorizados do servidor. Essas permissões não são criptografia do disco.

| Dado | Destino |
| --- | --- |
| Senha e código de dois fatores | Usados no login interativo com o Instagram, sem persistência nos arquivos do conector. |
| Sessão do Instagram | Arquivo privado no servidor ou dispositivo autorizado que executa o conector. |
| Chave de importação | Arquivo privado no estado do conector ou variável de ambiente `CAROLOS_REFERENCE_TOKEN`. |
| Cursor, fila e confirmações | SQLite no volume ou diretório privado para retomar consultas e evitar reenvios. |
| Link, legenda, autor e mídia selecionada | CMS e processamento de IA configurado nele. |
| Arquivos de transferência | Temporários no ambiente do conector, apagados ao terminar ou no próximo início depois de uma interrupção abrupta. |

A sessão do Instagram e a chave de importação não devem ser publicadas, anexadas a chamados ou copiadas para a Vercel. Se `CAROLOS_REFERENCE_TOKEN` estiver definida durante `setup`, seu valor é usado sem ser gravado na configuração. Para trocar a chave, gere uma nova no CMS e execute `setup` novamente com a mesma conta e coleção. Atualize também a variável de ambiente caso ela esteja em uso.

No container, preserve o volume montado em `/state`. Para escolher outro diretório privado no modo local, a opção deve vir antes do comando.

```bash
.venv/bin/python bridge.py --state-dir /caminho/privado/carolos setup
.venv/bin/python bridge.py --state-dir /caminho/privado/carolos login
.venv/bin/python bridge.py --state-dir /caminho/privado/carolos run
```

O programa recusa um diretório dentro de qualquer repositório Git e impede duas sincronizações simultâneas sobre a mesma pasta. O comando `status` pode ler o estado durante a operação. Uma configuração já vinculada não muda silenciosamente de conta, CMS ou coleção. Para uma identidade diferente, use outro diretório de estado e preserve o histórico anterior.

## Prazos, histórico e limites

Cada ciclo consulta até os primeiros 50 itens, limitado a quatro páginas nessa visita, e avança uma página adicional da varredura completa. Quando a varredura termina, ela começa outra passagem. O cursor e os itens de cada página são guardados na mesma transação. Assim, o conector pode retomar uma coleção grande e recuperar mais de 50 novos salvamentos sem encerrar a busca ao encontrar um post conhecido.

O intervalo mínimo é de 300 segundos, com uma variação de até 30 segundos. Ele é contado depois do trabalho do ciclo. Falhas temporárias ampliam a espera até uma hora. Coleções grandes, muitos posts novos e vídeos longos demoram mais para ficar completos no CMS. A data do post é guardada como data de publicação; ela não é apresentada como o momento em que Carol salvou o conteúdo.

São enviados até dez arquivos por referência, com limite de 50 MiB por arquivo e 80 MiB no conjunto. Um carrossel maior recebe uma nota sobre os arquivos omitidos. Formatos não suportados e arquivos acima do limite também geram uma observação para a análise. A referência pode então usar o texto e as mídias válidas que chegaram.

Os downloads usam somente URLs HTTPS de `cdninstagram.com`, `fbcdn.net` ou seus subdomínios. Cada redirecionamento é validado antes de outra conexão. O tamanho real e a assinatura do arquivo são conferidos. Endereços locais e respostas DNS com endereços privados são recusados. A conexão usa o IP público validado, com verificação TLS para o domínio original.

O envio ao Storage usa a origem informada pelo CMS autenticado no setup e fixada na configuração privada do conector. O destino assinado precisa corresponder à origem, ao caminho e ao token esperado. A chave do CMS só vai para a rota de importação do próprio CMS. Downloads e uploads não recebem esse cabeçalho e o envio ao CMS ou ao Storage não segue redirecionamentos.

Cada requisição de transferência é encerrada após 180 segundos contados depois da conexão TLS, inclusive se o servidor responder ou receber bytes lentamente. A conexão TCP tem limite de 15 segundos e as operações de socket usam 45 segundos. A resolução DNS segue a configuração do sistema operacional.

## Interrupções e exclusões

Se um download, upload ou confirmação falhar, o item continua na fila do conector. Uma resposta perdida não provoca outra referência no CMS. O reenvio usa o mesmo link e o mesmo identificador do post; arquivos que já chegaram são conferidos pelo servidor e o lote só é concluído depois da validação.

Uma mídia que retorna indisponibilidade ou acesso recusado permanece pendente. As próximas páginas da coleção podem renovar a URL de download. Se o conteúdo foi apagado ou deixou de ser acessível, o conector não consegue recuperar seus bytes e pode manter o item pendente indefinidamente. O aviso continua aparecendo no estado da conexão durante a espera. Nesse caso, a titular pode conferir o post no Instagram ou adicionar manualmente ao CMS o material ao qual ainda tem acesso.

Tirar um post dos Salvos não remove a referência já recebida no CMS. Ao excluir uma referência no CMS, o servidor guarda a exclusão para impedir que a coleção a importe novamente. A fila do conector também conserva os identificadores confirmados. Para recuperar uma referência excluída por decisão da titular, ela pode adicioná-la novamente pela interface do CMS.

Renomear a coleção ou mudar o nome de usuário no Instagram faz a validação parar. Isso evita continuar importando de uma pasta diferente. Pausar a conexão no CMS também impede novas entregas, e a retomada pelo CMS é automática quando a autorização volta a ser aceita. Substituir a chave exige atualizar a configuração do conector.

Uma URL de upload já emitida pelo Storage conserva seu prazo de validade mesmo depois de a chave ser substituída. A conclusão do lote no CMS continua exigindo uma conexão autorizada e o identificador correto do envio. Pausar o conector antes de remover a configuração evita transferências ainda em andamento.

## Verificação técnica

Os testes não precisam de dependências de terceiros, internet ou conta do Instagram.

```bash
python3 -B -m unittest discover -s tools/instagram-saves-bridge -p 'test_*.py' -v
```

Foram verificados offline o contrato de importação, a sessão restaurada antes de consultas, a interrupção em verificações do Instagram, as permissões locais, a paginação após muitos salvamentos, a atomicidade da fila, a recuperação de ACK perdido, os lotes de upload, os estados de exclusão e as restrições de rede. A revisão também cobriu a permanência do aviso de mídia pendente durante o backoff e o encerramento de transferências lentas.

### Validação da entrega inicial em 4 de outubro de 2026

- Typecheck, ESLint e compilação de produção concluídos sem erros.
- Suíte JavaScript com 1.286 testes, dos quais 1.280 passaram e seis testes de integração existentes ficaram ignorados por ausência das credenciais do ambiente descartável.
- Os 44 testes Python do conector passaram sem login e sem dependências externas.
- A migration foi executada primeiro em PostgreSQL embarcado e depois aplicada ao Supabase do projeto. Uma verificação transacional no banco real confirmou permissões, RLS, Realtime, rotação do hash do token, limite de dois trabalhos, proteção por lease, criação idempotente de rascunho em Ideia e exclusão que preserva o calendário e impede reimportação. Toda a transação de teste foi revertida. As tabelas novas continuaram sem referências e sem conexão ativa.
- O servidor local de produção passou seis verificações HTTP de autenticação, método permitido, acesso à mídia e abertura da página de login.
- A sintaxe da busca foi aceita pelo PostgREST real. As consultas anônimas, incluindo caracteres especiais, foram recusadas pelas permissões da tabela como esperado.
- A identidade visual foi revisada no código, usando os mesmos tokens e fontes do dashboard. A validação visual em navegador ficou pendente porque o ambiente bloqueou os sockets do navegador e sua política recusou execução com permissões adicionais. Os dados fictícios usados na preparação dessa verificação e a opção temporária de preview foram removidos da implementação.

**O login e a sincronização com a conta real da Carol ainda precisam ser validados no servidor ou dispositivo autorizado por ela.** Nenhuma credencial do Instagram foi usada na implementação. Na entrega inicial, a instalação das dependências no ambiente de desenvolvimento não se concluiu porque a autorização de rede foi cancelada antes da decisão. Esse registro histórico não valida a imagem Docker ou uma sessão real. Os testes offline não garantem que o Instagram aceitará uma sessão real ou manterá os endpoints da integração não oficial.

A extração de mídia e a resposta estruturada do modelo foram verificadas com respostas controladas nos testes. Uma transcrição com o provedor real continua pendente até a ativação e o primeiro envio autorizado.

## Fontes e decisão de integração

Verificação técnica realizada em 4 de outubro de 2026.

- A [documentação de webhooks do Instagram da Meta](https://developers.facebook.com/documentation/instagram-platform/webhooks) não documenta um evento para salvar em uma coleção privada nem uma interface para ler essa coleção. Essa ausência na API documentada impede tratar o fluxo como sincronização oficial instantânea.
- A [documentação de coleções do instagrapi](https://subzeroid.github.io/instagrapi/latest/usage-guide/collection/) descreve a leitura paginada usada pelo conector. Ela fornece uma implementação não oficial, sujeita a alterações e restrições do Instagram.
- As [interações e sessões do instagrapi](https://subzeroid.github.io/instagrapi/latest/usage-guide/interactions/) documentam a restauração de configurações, o login e a autenticação de dois fatores. O conector restringe esses recursos ao ambiente autorizado que o executa e interrompe a consulta diante de desafios.
- As versões fixadas foram verificadas nas páginas primárias de [instagrapi no PyPI](https://pypi.org/project/instagrapi/3.0.20/) e [Requests no PyPI](https://pypi.org/project/requests/2.34.2/).
- O upload utiliza o contrato de [upload assinado do Supabase](https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl), com confirmação posterior dos objetos no servidor.

A implementação preserva o hábito de salvar pelo iPhone mediante ativação explícita. No modo servidor, a disponibilidade contínua depende da conta, da sessão e da Hetzner. Os computadores pessoais não participam da operação diária.
