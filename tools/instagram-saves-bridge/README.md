# Conector dos Salvos da Carol

O conector acompanha a coleção **Referências UGC** da conta **@carolxqueiroz** e envia o material para o CarolOS. A instalação recomendada usa um serviço próprio na Hetzner. Depois da configuração e do primeiro login, os computadores do Pedro e da Carol podem ficar desligados.

A integração com o Instagram é não oficial. Cada ciclo tem intervalo mínimo de cinco minutos, além do tempo de transferência. O CMS mostra o andamento recebido em tempo real. Uma verificação exigida pelo Instagram interrompe as consultas e exige uma ação autorizada.

O guia completo de instalação, ativação, privacidade e recuperação está em [Salvos do Instagram no CarolOS](../../docs/instagram-saved-references.md).

## Hetzner

Use um servidor Linux autorizado com Docker Engine, Docker Compose v2 e Git. O serviço fica em `/opt/carolos-instagram-saves`, no projeto Compose `carolos-instagram-saves`. Ele usa Python 3.12 dentro do container, não publica portas e não modifica os serviços de outros projetos.

Disponibilize uma cópia revisada do repositório no servidor e execute por SSH a partir da raiz dessa cópia. Substitua `SHA_DO_COMMIT_PUBLICADO` pelo SHA completo da versão publicada que será instalada. Se a sessão já usa `root`, omita `sudo`.

```bash
sudo bash tools/instagram-saves-bridge/install-server.sh --check
sudo bash tools/instagram-saves-bridge/install-server.sh --ref SHA_DO_COMMIT_PUBLICADO
```

`--check` confere os requisitos sem instalar o serviço, incluindo pelo menos 1 GiB de memória disponível e 3 GiB livres em `/opt`. A instalação por `--ref` baixa a versão escolhida, prepara somente a pasta dedicada, constrói a imagem e conduz a configuração e o login quando os arquivos correspondentes ainda não existem. Depois, deixa o serviço em execução. O volume de estado é preservado em atualizações.

No `setup`, confirme a autorização solicitada e informe `https://carolqueiroz.pt`, `carolxqueiroz`, `Referências UGC` e a chave gerada em **Conteúdo → Referências → Pasta do Instagram**. Chave, senha e código de autenticação são informados nos prompts privados. Não os coloque no comando ou no Compose.

O modo `serve` continua em segundo plano e retoma a fila quando o processo ou o servidor reinicia. O Docker precisa iniciar com o servidor. Uma parada manual permanece até executar `docker compose up -d`. A configuração, a sessão e o progresso ficam no volume exclusivo montado em `/state`.

```bash
cd /opt/carolos-instagram-saves
docker compose ps
docker compose run --rm -T instagram-saves status
docker compose logs --tail 100 instagram-saves
```

Os comandos Compose pressupõem acesso ao Docker. Use `sudo` antes de `docker` se necessário. O comando `status` pode rodar junto ao serviço. Ele lê o estado local e não consulta o Instagram. Um bloqueio de sessão permanece após reinícios e não provoca tentativas automáticas de login. Resolva a solicitação no aplicativo oficial antes de renovar a sessão, quando necessário.

```bash
docker compose stop instagram-saves
docker compose run --rm -i instagram-saves login --renew
docker compose up -d
```

Se a falha já foi corrigida e a sessão continua válida, use `resume` no lugar de `login --renew`. A confirmação `RETOMAR` autoriza validar CMS, sessão e coleção antes de liberar o bloqueio. Não use `docker compose down --volumes` para reiniciar ou atualizar o serviço.

Uma pausa feita no CMS pode ser desfeita pelo próprio CMS. O serviço confere a autorização novamente, sem acessar o Instagram durante essa espera, e retoma automaticamente quando ela volta a ser aceita. A troca da chave exige atualizar `setup`.

## Alternativa no computador da Carol

O modo local usa macOS ou Linux com Python 3.10 ou superior, dentro de um ambiente virtual. Ele depende de esse computador ficar ligado enquanto o processo estiver ativo.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py setup
.venv/bin/python bridge.py login
.venv/bin/python bridge.py once
.venv/bin/python bridge.py run
```

Se o ambiente virtual foi criado sem `pip`, o guia inclui a recuperação com `ensurepip`. Para usar a Hetzner, não é necessário corrigir ou continuar a instalação no Mac do Pedro.

## Dados e verificação

A senha nunca é persistida pelo conector. A sessão e a chave de importação ficam privadas no servidor ou dispositivo autorizado, fora do Git. O CMS nunca recebe a senha ou a sessão do Instagram.

Testes offline podem ser executados da raiz deste repositório.

```bash
python3 -B -m unittest discover -s tools/instagram-saves-bridge -p 'test_*.py' -v
```

O funcionamento com a conta real depende da ativação, da aceitação do login e do primeiro envio autorizado. A presença dos arquivos de implantação não comprova que o servidor foi configurado ou que a conta já está conectada.
