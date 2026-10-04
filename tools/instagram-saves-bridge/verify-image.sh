#!/usr/bin/env bash
set -euo pipefail

CAROLOS_IMAGE="${1:-carolos-instagram-saves:local}"
CAROLOS_SMOKE_VOLUME="carolos-saves-smoke-${GITHUB_RUN_ID:-$$}-${RANDOM}"

cleanup() {
  docker volume rm "$CAROLOS_SMOKE_VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$CAROLOS_SMOKE_VOLUME" >/dev/null
CAROLOS_RUN_ARGS=(
  --rm --network none --read-only --user 10001:10001
  --cap-drop ALL --security-opt no-new-privileges
  --memory 512m --memory-swap 512m --cpus 0.5 --pids-limit 128
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777
  --mount "type=volume,source=$CAROLOS_SMOKE_VOLUME,target=/state"
  --entrypoint python
)

# A real import of the pinned packages catches missing wheels and shared
# libraries. No account, credential or external network is available here.
docker run -i "${CAROLOS_RUN_ARGS[@]}" "$CAROLOS_IMAGE" - <<'PY'
import importlib.metadata
import os
from pathlib import Path
import ssl
import sqlite3
import stat

import curl_cffi
import PIL
import requests
from instagrapi import Client
from bridge_core import State, private_directory, write_private_json

assert os.getuid() == 10001
assert importlib.metadata.version('instagrapi') == '3.0.20'
assert requests.__version__ == '2.34.2'
assert ssl.create_default_context().get_ca_certs()
assert Client(request_timeout=2) is not None
os.umask(0o077)
state_dir = private_directory(Path('/state'), repo_root=Path('/app'))
assert state_dir.stat().st_uid == 10001
assert stat.S_IMODE(state_dir.stat().st_mode) == 0o700
write_private_json(state_dir / 'smoke-check.json', {'verified': True})
queue = State(state_dir / 'smoke.sqlite3', 'offline-container-check')
queue.close()
for path in state_dir.iterdir():
    if path.is_file():
        assert path.stat().st_uid == 10001
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
print('Dependências, TLS, permissões e SQLite verificados sem rede.')
PY

# A fresh container must see the same private state and owner.
docker run -i "${CAROLOS_RUN_ARGS[@]}" "$CAROLOS_IMAGE" - <<'PY'
from pathlib import Path
from bridge_core import State, private_directory, read_private_json

state_dir = private_directory(Path('/state'), repo_root=Path('/app'))
assert read_private_json(state_dir / 'smoke-check.json') == {'verified': True}
queue = State(state_dir / 'smoke.sqlite3', 'offline-container-check')
queue.close()
print('Estado preservado entre dois contêineres.')
PY
