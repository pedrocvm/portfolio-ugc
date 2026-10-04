#!/usr/bin/env bash
# Run this saved file inside an interactive SSH session. Do not pipe it to bash.
set -euo pipefail
umask 077

CAROLOS_DEST=/opt/carolos-instagram-saves
CAROLOS_PROJECT=carolos-instagram-saves
CAROLOS_REF=main
CAROLOS_CHECK_ONLY=0
CAROLOS_STAGE=
CAROLOS_MARKER=carolos-instagram-saves-managed-v1

fail() { printf '%s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ -n "$CAROLOS_STAGE" && -d "$CAROLOS_STAGE" ]]; then
    rm -rf -- "$CAROLOS_STAGE"
  fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CAROLOS_CHECK_ONLY=1; shift ;;
    --ref)
      [[ $# -ge 2 ]] || fail 'Informe o commit depois de --ref.'
      CAROLOS_REF=$2; shift 2 ;;
    --help)
      printf '%s\n' 'Uso' '  sudo bash install-server.sh --ref COMMIT' '  bash install-server.sh --check'
      exit 0 ;;
    *) fail "Opção não reconhecida $1" ;;
  esac
done

[[ "$CAROLOS_REF" == main || "$CAROLOS_REF" =~ ^[a-f0-9]{40}$ ]] \
  || fail 'Use main ou o identificador completo de um commit.'
[[ "$(uname -s)" == Linux ]] || fail 'Este instalador é para o servidor Linux. Não execute no Mac.'
for CAROLOS_COMMAND in docker git awk df mktemp install stat; do
  command -v "$CAROLOS_COMMAND" >/dev/null || fail "Falta o comando $CAROLOS_COMMAND no servidor."
done
docker info >/dev/null 2>&1 || fail 'O Docker não respondeu ou este usuário não tem acesso ao Docker.'
docker compose version >/dev/null 2>&1 || fail 'É necessário Docker Compose v2 no servidor.'

CAROLOS_AVAILABLE_KIB=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
CAROLOS_DISK_KIB=$(df -Pk /opt | awk 'NR == 2 { print $4 }')
[[ "$CAROLOS_AVAILABLE_KIB" =~ ^[0-9]+$ && "$CAROLOS_DISK_KIB" =~ ^[0-9]+$ ]] \
  || fail 'Não foi possível conferir memória e espaço disponível.'
printf 'Memória disponível aproximada %s MiB\n' "$((CAROLOS_AVAILABLE_KIB / 1024))"
printf 'Espaço disponível em /opt %s MiB\n' "$((CAROLOS_DISK_KIB / 1024))"
docker stats --no-stream --format '{{.Name}}  {{.MemUsage}}  {{.CPUPerc}}'
(( CAROLOS_AVAILABLE_KIB >= 1048576 )) \
  || fail 'É necessário pelo menos 1 GiB de memória disponível para preparar este serviço. A instalação foi interrompida.'
(( CAROLOS_DISK_KIB >= 3145728 )) \
  || fail 'É necessário pelo menos 3 GiB de espaço disponível em /opt. A instalação foi interrompida.'

if (( CAROLOS_CHECK_ONLY )); then
  printf '%s\n' 'A conferência terminou. Nenhum serviço foi instalado ou reiniciado.'
  exit 0
fi

[[ $EUID -eq 0 ]] || fail 'Execute este instalador com sudo para criar a pasta dedicada em /opt.'
[[ -t 0 && -t 1 ]] || fail 'Execute o arquivo em uma sessão SSH com terminal para configurar a conta em segurança.'
[[ ! -L "$CAROLOS_DEST" ]] || fail 'A pasta de instalação não pode ser um link.'
if [[ -e "$CAROLOS_DEST" ]]; then
  [[ -d "$CAROLOS_DEST" && ! -L "$CAROLOS_DEST/.managed" ]] \
    || fail 'O destino não é uma instalação válida do conector.'
  [[ -f "$CAROLOS_DEST/.managed" && "$(cat "$CAROLOS_DEST/.managed")" == "$CAROLOS_MARKER" ]] \
    || fail 'A pasta de destino já existe e não pertence a este instalador. Nenhum arquivo foi substituído.'
  [[ "$(stat -c %u "$CAROLOS_DEST")" == 0 ]] \
    || fail 'A instalação existente precisa pertencer ao administrador do servidor.'
fi

printf '%s\n' 'Preparando uma versão isolada do conector.'
CAROLOS_STAGE=$(mktemp -d /opt/.carolos-instagram-install.XXXXXXXX)
git init --quiet "$CAROLOS_STAGE/repository"
git -C "$CAROLOS_STAGE/repository" remote add origin https://github.com/pedrocvm/portfolio-ugc.git
git -C "$CAROLOS_STAGE/repository" sparse-checkout init --cone
git -C "$CAROLOS_STAGE/repository" sparse-checkout set tools/instagram-saves-bridge
GIT_TERMINAL_PROMPT=0 git -C "$CAROLOS_STAGE/repository" fetch --quiet --depth=1 --filter=blob:none --no-tags origin "$CAROLOS_REF"
git -C "$CAROLOS_STAGE/repository" -c core.hooksPath=/dev/null checkout --quiet --detach FETCH_HEAD
CAROLOS_REVISION=$(git -C "$CAROLOS_STAGE/repository" rev-parse HEAD)
CAROLOS_SOURCE="$CAROLOS_STAGE/repository/tools/instagram-saves-bridge"
CAROLOS_FILES=(Dockerfile .dockerignore compose.yaml requirements.txt bridge.py bridge_core.py bridge_service.py verify-image.sh install-server.sh README.md)
for CAROLOS_FILE in "${CAROLOS_FILES[@]}"; do
  [[ -f "$CAROLOS_SOURCE/$CAROLOS_FILE" && ! -L "$CAROLOS_SOURCE/$CAROLOS_FILE" ]] \
    || fail "A versão escolhida não contém o arquivo esperado $CAROLOS_FILE."
done

CAROLOS_STAGE_COMPOSE=(docker compose --project-name "$CAROLOS_PROJECT" --project-directory "$CAROLOS_SOURCE" -f "$CAROLOS_SOURCE/compose.yaml")
"${CAROLOS_STAGE_COMPOSE[@]}" config --quiet
"${CAROLOS_STAGE_COMPOSE[@]}" build --build-arg "CAROLOS_SOURCE_REVISION=$CAROLOS_REVISION"
bash "$CAROLOS_SOURCE/verify-image.sh" carolos-instagram-saves:local

# A known installation is stopped only after its replacement builds and passes
# the dependency/storage smoke test. No other Compose project is addressed.
if [[ -f "$CAROLOS_DEST/compose.yaml" ]]; then
  docker compose --project-name "$CAROLOS_PROJECT" --project-directory "$CAROLOS_DEST" -f "$CAROLOS_DEST/compose.yaml" stop instagram-saves
fi
install -d -m 0755 "$CAROLOS_DEST"
for CAROLOS_FILE in "${CAROLOS_FILES[@]}"; do
  [[ ! -L "$CAROLOS_DEST/$CAROLOS_FILE" ]] || fail "O destino de $CAROLOS_FILE não pode ser um link."
  install -m 0644 "$CAROLOS_SOURCE/$CAROLOS_FILE" "$CAROLOS_DEST/$CAROLOS_FILE"
done
printf '%s\n' "$CAROLOS_MARKER" > "$CAROLOS_DEST/.managed"
printf '%s\n' "$CAROLOS_REVISION" > "$CAROLOS_DEST/revision.txt"
CAROLOS_COMPOSE=(docker compose --project-name "$CAROLOS_PROJECT" --project-directory "$CAROLOS_DEST" -f "$CAROLOS_DEST/compose.yaml")

state_file_exists() {
  "${CAROLOS_COMPOSE[@]}" run --rm --no-deps -T --entrypoint python instagram-saves \
    -c 'import pathlib, sys; sys.exit(0 if pathlib.Path("/state", sys.argv[1]).is_file() else 1)' "$1" >/dev/null 2>&1
}

if ! state_file_exists config.json; then
  printf '%s\n' 'Configure a conexão. A chave fica no volume privado deste servidor.'
  "${CAROLOS_COMPOSE[@]}" run --rm --no-deps -i instagram-saves setup
fi
if ! state_file_exists session.json; then
  printf '%s\n' 'O primeiro login é feito aqui, pelo terminal SSH. A senha não é salva.'
  read -r -p 'A conta usa autenticação de dois fatores? [s/N] ' CAROLOS_TWO_FACTOR
  CAROLOS_LOGIN_ARGS=()
  case "$CAROLOS_TWO_FACTOR" in s|S|sim|Sim) CAROLOS_LOGIN_ARGS=(--two-factor) ;; esac
  if ! "${CAROLOS_COMPOSE[@]}" run --rm --no-deps -i instagram-saves login "${CAROLOS_LOGIN_ARGS[@]}"; then
    printf '%s\n' 'O login precisa de uma ação da titular. Confira a mensagem e o app oficial do Instagram.' \
      "Os arquivos de instalação ficaram em $CAROLOS_DEST. O serviço não foi iniciado."
    exit 1
  fi
fi

"${CAROLOS_COMPOSE[@]}" up -d --no-deps instagram-saves
"${CAROLOS_COMPOSE[@]}" ps
printf '%s\n' 'A execução automática foi registrada no servidor.' \
  'Acompanhe a primeira consulta em Referências no CarolOS. Nenhum computador pessoal precisa ficar ligado.' \
  'Para consultar o estado pelo servidor, use' \
  "sudo docker compose --project-name $CAROLOS_PROJECT -f $CAROLOS_DEST/compose.yaml exec -T instagram-saves python bridge.py --state-dir /state status"
