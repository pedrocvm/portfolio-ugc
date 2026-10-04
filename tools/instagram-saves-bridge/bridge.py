#!/usr/bin/env python3
"""Opt-in Instagram collection bridge for a private computer or isolated server."""

from __future__ import annotations

import argparse
import contextlib
import getpass
import importlib.metadata
import json
import logging
import os
import random
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from bridge_core import (
    BridgeError, CMSClient, Config, POLL_SECONDS, State, discover, get_field,
    normalized_origin, private_directory, process_lock, process_snapshot,
    read_private_json, short_text, utc_now, validate_username, write_private_json,
)
from bridge_service import (
    IDLE_SECONDS, ServiceStopped, block_service, clear_block, daemon_lock,
    handle_termination, health_exit_code, local_status, read_block,
    require_unblocked, write_status,
)


INSTAGRAPI_VERSION = "3.0.20"
DEFAULT_CMS = "https://carolqueiroz.pt"
DEFAULT_STATE = Path.home() / ".local" / "share" / "carolos" / "instagram-saves"
SCRIPT_DIRECTORY = Path(__file__).resolve().parent
# The container retains tools/instagram-saves-bridge, but standalone installs
# must never turn '/' into a repository root that would also reject /state.
REPO_ROOT = SCRIPT_DIRECTORY.parents[1] if SCRIPT_DIRECTORY.name == "instagram-saves-bridge" and SCRIPT_DIRECTORY.parent.name == "tools" else SCRIPT_DIRECTORY
MAX_IMPORTS_PER_CYCLE = 10

MESSAGES = {
    "setup_required": "Execute setup neste computador antes de continuar.",
    "login_required": "Execute login neste computador para conectar a conta do Instagram.",
    "dependency_missing": "Instale requirements.txt em um ambiente virtual Python antes de fazer login.",
    "dependency_version": "O ambiente virtual usa outra versão do instagrapi. Instale requirements.txt para continuar.",
    "instagram_action_required": "O Instagram exige uma ação da titular. O conector parou. Abra o app oficial, resolva a verificação e só depois execute login --renew neste computador.",
    "instagram_two_factor_required": "O Instagram pediu autenticação de dois fatores. Confira a conta no app oficial e execute login --two-factor para informar localmente um código legítimo. Não desative a proteção.",
    "instagram_rate_limited": "O Instagram limitou as consultas. O conector vai aguardar antes de tentar novamente.",
    "instagram_temporarily_unavailable": "O Instagram está temporariamente indisponível. O progresso foi preservado.",
    "instagram_client_incompatible": "O formato retornado pelo Instagram mudou. O conector parou sem avançar a fila. É preciso revisar a versão da integração.",
    "instagram_cursor_stalled": "A paginação do Instagram não avançou. O conector preservou o ponto de retomada.",
    "instagram_account_mismatch": "A sessão pertence a outra conta ou o nome da conta mudou. O conector parou para revisão local.",
    "instagram_collection_mismatch": "A coleção vinculada não foi encontrada com o mesmo ID e nome. Confira a pasta no Instagram.",
    "instagram_collection_not_found": "Crie no Instagram a coleção configurada e execute login novamente.",
    "instagram_session_missing": "Não há uma sessão local válida. Execute login neste computador.",
    "invalid_instagram_response": "A resposta do Instagram não tem o formato esperado. Nenhum cursor dessa página foi avançado.",
    "cms_token_required": "Forneça um token de importação no setup ou na variável CAROLOS_REFERENCE_TOKEN.",
    "cms_connection_refused": "O CMS recusou a conexão. Confira se ela está ativa e se o token ainda é válido.",
    "cms_temporarily_unavailable": "O CMS está temporariamente indisponível. A fila local será retomada.",
    "cms_request_rejected": "O CMS recusou o envio. O conector preservou a referência para revisão.",
    "storage_origin_changed": "O endereço de armazenamento mudou. Revise a mudança e execute setup novamente para autorizar a nova configuração.",
    "media_unavailable": "Uma mídia está indisponível ou expirou. A referência continua na fila e será tentada com os dados das próximas consultas.",
    "reference_pending_retry": "Há referências que ainda não chegaram ao CMS. Elas continuam na fila local, aguardando nova tentativa.",
    "media_temporarily_unavailable": "O Instagram não conseguiu entregar a mídia agora. A referência continua na fila.",
    "incomplete_media": "O download não terminou. O arquivo parcial foi apagado e a referência continua na fila.",
    "media_timeout": "O download ultrapassou o tempo permitido. O arquivo parcial foi apagado.",
    "network_unavailable": "A conexão de rede falhou. O progresso foi preservado.",
    "network_timeout": "Uma transferência excedeu o tempo de espera. O progresso foi preservado para a próxima tentativa.",
    "invalid_cms_response": "O CMS devolveu uma resposta inesperada. Nenhuma referência pendente foi confirmada localmente.",
    "incomplete_cms_acknowledgement": "O CMS não confirmou a conclusão desse item. Ele permanece na fila.",
    "upload_spec_mismatch": "O arquivo recebido não corresponde ao lote de upload. A referência permanece na fila para revisão.",
    "upload_rejected": "O armazenamento recusou o upload. A referência permanece na fila.",
    "upload_temporarily_unavailable": "O upload não terminou. O conector vai retomar o lote pendente.",
    "already_running": "Já existe um conector usando esta pasta de estado. Use apenas um processo por conta.",
    "state_inside_repository": "A sessão e o token precisam ficar fora de qualquer repositório Git.",
    "state_identity_mismatch": "Esta pasta de estado pertence a outra conexão ou coleção. Use outra pasta de estado para preservar o histórico existente.",
    "bound_identity_changed": "Esta configuração já tem conta e coleção vinculadas. Use outra pasta de estado para uma conta ou coleção diferente.",
    "unsafe_state_directory": "A pasta de estado local não tem propriedade ou permissões seguras.",
    "unsafe_state_file": "Um arquivo local de estado é um link ou está acessível a outros usuários. Corrija as permissões antes de continuar.",
    "invalid_local_config": "A configuração local não pôde ser lida. Confira a pasta escolhida ou execute setup.",
    "consent_required": "O conector só pode ser configurado depois da aceitação explícita neste computador.",
    "interactive_required": "Execute este comando em um terminal local para informar as credenciais sem exibi-las.",
    "invalid_origin": "Informe somente a origem HTTPS do CMS, sem caminhos ou parâmetros.",
    "unsafe_url": "Foi recusado um endereço que não atende às regras de conexão segura.",
    "private_network_refused": "Foi recusada uma conexão para endereço de rede local ou reservado.",
    "untrusted_storage_host": "O destino do upload não é o armazenamento vinculado a este CMS.",
    "invalid_upload_target": "O CMS não devolveu um destino de upload válido para o arquivo.",
    "unsupported_platform": "Este conector requer macOS ou Linux para proteger os arquivos e impedir execuções simultâneas.",
    "local_io_error": "Não foi possível ler ou salvar o estado local. Confira o espaço livre e as permissões.",
    "service_blocked": "Há um bloqueio persistente. Execute status e conclua a ação indicada antes de retomar. Reiniciar o serviço não remove esse bloqueio.",
    "resume_not_confirmed": "A retomada não foi confirmada. O serviço continua aguardando intervenção.",
    "unexpected_error": "O conector encontrou um erro inesperado e aguarda revisão da instalação. O progresso foi preservado.",
}


def error_message(error: BridgeError) -> str:
    message = MESSAGES.get(error.code, "O conector interrompeu esta operação. O estado local foi preservado.")
    if server_location():
        message = message.replace("neste computador", "neste servidor").replace("terminal local", "terminal interativo do conector")
    return message


def server_location() -> bool:
    return os.environ.get("CAROLOS_BRIDGE_LOCATION", "").lower() == "server"


def location() -> str:
    return "neste servidor" if server_location() else "neste computador"


def load_config(state_dir: Path) -> Config:
    path = state_dir / "config.json"
    if not path.exists() and not path.is_symlink():
        raise BridgeError("setup_required")
    return Config.load(path)


def show_error(error: BridgeError) -> None:
    print(error_message(error), file=sys.stderr)


@contextlib.contextmanager
def quiet_library():
    """Third-party output can include request data. Never forward it to logs."""
    previous = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        with open(os.devnull, "w", encoding="utf-8") as sink:
            with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                yield
    finally:
        logging.disable(previous)


def translate_instagram_error(error: Exception) -> BridgeError:
    names = {kind.__name__ for kind in type(error).__mro__}
    if "TwoFactorRequired" in names:
        return BridgeError("instagram_two_factor_required")
    if any(any(part in name for part in (
        "Challenge", "Checkpoint", "Captcha", "FeedbackRequired", "LoginRequired",
        "BadPassword", "SentryBlock", "ConsentRequired", "AccountSuspended",
        "AccountDisabled", "ProxyAddressIsBlocked", "Recaptcha",
    )) for name in names):
        return BridgeError("instagram_action_required")
    if names & {"ClientThrottledError", "PleaseWaitFewMinutes", "RateLimitError"}:
        return BridgeError("instagram_rate_limited", temporary=True)
    if names & {"ConnectionError", "ConnectTimeout", "ReadTimeout", "Timeout", "ClientConnectionError", "ClientRequestTimeout", "ClientIncompleteReadError", "ClientError"}:
        # Unknown HTTP/client errors must not trigger login or challenge handling.
        # Only the known connection subclasses are retried below.
        if not names & {"ClientError"} or names & {"ClientConnectionError", "ClientRequestTimeout", "ClientIncompleteReadError"}:
            return BridgeError("instagram_temporarily_unavailable", temporary=True)
    if names & {"ValidationError", "ClientJSONDecodeError", "KeyError", "TypeError"}:
        return BridgeError("instagram_client_incompatible")
    return BridgeError("instagram_action_required")


def library_call(function, *args, **kwargs):
    try:
        with quiet_library():
            return function(*args, **kwargs)
    except BridgeError:
        raise
    except Exception as error:
        raise translate_instagram_error(error) from None


class InstagramClient:
    def __init__(self, config: Config, session_path: Path):
        try:
            version = importlib.metadata.version("instagrapi")
        except importlib.metadata.PackageNotFoundError:
            raise BridgeError("dependency_missing") from None
        if version != INSTAGRAPI_VERSION:
            raise BridgeError("dependency_version")
        with quiet_library():
            from instagrapi import Client
            self.client = Client(request_timeout=2)
        self.config = config
        self.session_path = session_path

        def rethrow(_client, error):
            raise error

        def stop_verification(*_args, **_kwargs):
            raise BridgeError("instagram_action_required")

        # Disable automatic challenge resolution, password changes and prompts.
        # This bridge performs no proxy setup, rotation, session-cookie imports,
        # public media fallback, write actions, or automatic credential re-login.
        self.client.handle_exception = rethrow
        self.client.challenge_resolve = stop_verification
        self.client.challenge_code_handler = stop_verification
        self.client.change_password_handler = stop_verification
        self.client.delay_range = [1, 3]
        if session_path.exists():
            saved = read_private_json(session_path)
            if saved.get("username") != config.username:
                raise BridgeError("instagram_account_mismatch")
            if config.account_id and str(saved.get("account_id")) != config.account_id:
                raise BridgeError("instagram_account_mismatch")
            if not isinstance(saved.get("settings"), dict):
                raise BridgeError("instagram_session_missing")
            library_call(self.client.set_settings, saved["settings"])
        self.client.username = config.username
        # An expired daemon session must stop. The password exists only inside
        # the explicit local login command and is never persisted.
        self.client.password = ""

    def account(self) -> tuple[str, str]:
        if not self.client.user_id:
            raise BridgeError("instagram_session_missing")
        account = library_call(self.client.account_info)
        account_id = str(get_field(account, "pk", ""))
        username = validate_username(get_field(account, "username", ""))
        if username != self.config.username or (self.config.account_id and account_id != self.config.account_id):
            raise BridgeError("instagram_account_mismatch")
        return account_id, username

    def validate_binding(self) -> None:
        self.account()
        if not self.config.collection_id:
            raise BridgeError("login_required")
        collections = library_call(self.client.collections)
        if not any(str(get_field(collection, "id", "")) == self.config.collection_id
                   and get_field(collection, "name", "") == self.config.collection_name for collection in collections):
            raise BridgeError("instagram_collection_mismatch")

    def collection_page(self, collection_id: str, cursor: str):
        items, next_cursor = library_call(self.client.collection_medias_v1_chunk, collection_id, max_id=cursor)
        return list(items), str(next_cursor) if next_cursor else ""

    def save(self) -> None:
        settings = library_call(self.client.get_settings)
        # dump_settings normally excludes credentials; do not persist a password
        # even if a later library version changes its settings representation.
        settings.pop("password", None)
        write_private_json(self.session_path, {
            "version": 1, "username": self.config.username,
            "account_id": self.config.account_id, "settings": settings,
        })


def require_terminal():
    if not sys.stdin.isatty():
        raise BridgeError("interactive_required")


def prompt(label: str, default: str = "") -> str:
    answer = input(f"{label}" + (f" [{default}]" if default else "") + " ").strip()
    return answer or default


def cms_token(config: Config) -> str:
    value = os.environ.get("CAROLOS_REFERENCE_TOKEN", "") or config.cms_token
    if not value:
        if not sys.stdin.isatty():
            raise BridgeError("cms_token_required")
        value = getpass.getpass("Token de importação do CarolOS ").strip()
    return value


def setup(state_dir: Path) -> None:
    require_terminal()
    config_path = state_dir / "config.json"
    previous = Config.load(config_path) if config_path.exists() else None
    print("No CMS, abra Referências, crie a conexão e copie o token de importação. No Instagram, crie uma coleção de Salvos com o mesmo nome informado nessa conexão.")
    if server_location():
        print("Este conector usa uma integração não oficial. Ele consulta a pasta em intervalos de pelo menos cinco minutos enquanto o serviço estiver ativo no servidor e pode parar se o Instagram exigir verificação ou mudar a interface.")
        print("A sessão do Instagram será guardada no volume privado deste servidor. A senha é usada somente no login interativo e não é salva. Apenas as referências e suas mídias selecionadas serão enviadas ao CMS para análise.")
        consent_label = "Para autorizar esta integração e guardar a sessão neste servidor, digite ACEITO"
    else:
        print("Este conector usa uma integração não oficial. Ele consulta a pasta em intervalos de pelo menos cinco minutos enquanto este computador estiver ligado e pode parar se o Instagram exigir verificação ou mudar a interface.")
        print("A sessão do Instagram fica neste computador. A senha é usada somente no login e não é salva. Apenas as referências e suas mídias selecionadas serão enviadas ao seu CMS para análise.")
        consent_label = "Para aceitar e configurar esta integração local, digite ACEITO"
    if prompt(consent_label) != "ACEITO":
        raise BridgeError("consent_required")
    origin = normalized_origin(prompt("Endereço HTTPS do CarolOS", previous.cms_origin if previous else DEFAULT_CMS))
    username = validate_username(prompt("Nome de usuário no Instagram", previous.username if previous else "carolxqueiroz"))
    collection_name = prompt("Nome exato da coleção", previous.collection_name if previous else "Referências UGC")
    if not 1 <= len(collection_name) <= 100:
        raise BridgeError("invalid_local_config")
    if previous and previous.account_id and (username != previous.username or collection_name != previous.collection_name or origin != previous.cms_origin):
        raise BridgeError("bound_identity_changed")
    environment_token = os.environ.get("CAROLOS_REFERENCE_TOKEN", "")
    token = environment_token or getpass.getpass("Token de importação do CarolOS ").strip()
    cms = CMSClient(origin, token)
    info = cms.heartbeat(synced=False)
    if info.get("collectionName") and info["collectionName"] != collection_name:
        raise BridgeError("instagram_collection_mismatch")
    config = Config(
        cms_origin=origin, storage_origin=normalized_origin(info["storageOrigin"]),
        username=username, collection_name=collection_name,
        collection_id=previous.collection_id if previous else "",
        account_id=previous.account_id if previous else "",
        cms_token="" if environment_token else token, accepted_at=utc_now(),
    )
    config.save(config_path)
    print(f"Configuração salva. Agora execute login {location()}. Nenhuma sessão do Instagram foi enviada ao CMS.")


def login(state_dir: Path, *, renew: bool = False, two_factor: bool = False) -> None:
    require_terminal()
    config_path = state_dir / "config.json"
    config = load_config(state_dir)
    adapter = InstagramClient(config, state_dir / "session.json")
    use_saved = bool(adapter.client.user_id) and not renew and not two_factor
    if use_saved:
        adapter.account()  # A rejected session stops; renewal must be explicit.
        print(f"Sessão restaurada {location()}.")
    else:
        if renew:
            print("A renovação só deve continuar depois de concluir verificações pendentes no app oficial do Instagram.")
        password = getpass.getpass(f"Senha do Instagram, usada somente {location()} ")
        code = getpass.getpass("Código atual da autenticação de dois fatores ").strip() if two_factor else ""
        try:
            library_call(adapter.client.login, config.username, password, relogin=renew, verification_code=code)
        finally:
            adapter.client.password = ""
            password = ""
            code = ""
    account_id, _username = adapter.account()
    collections = library_call(adapter.client.collections)
    matches = [collection for collection in collections if get_field(collection, "name", "") == config.collection_name]
    if config.collection_id:
        matches = [collection for collection in matches if str(get_field(collection, "id", "")) == config.collection_id]
    if not matches:
        raise BridgeError("instagram_collection_not_found")
    if len(matches) > 1:
        print("Existem coleções com o mesmo nome. Escolha o ID da pasta que deseja sincronizar.")
        for collection in matches:
            print(short_text(get_field(collection, "id", ""), 40))
        chosen = prompt("ID da coleção")
        matches = [collection for collection in matches if str(get_field(collection, "id", "")) == chosen]
        if len(matches) != 1:
            raise BridgeError("instagram_collection_mismatch")
    config.account_id = account_id
    config.collection_id = str(get_field(matches[0], "id"))
    config.save(config_path)
    adapter.save()
    validate_cms_binding(config)
    clear_block(state_dir)
    if server_location():
        print("Conta, coleção e autorização do CMS confirmadas. O serviço pode sincronizar com a sessão guardada neste servidor.")
    else:
        print("Conta, coleção e autorização do CMS confirmadas. Execute once para validar uma consulta ou run para manter a sincronização ativa.")


def validate_cms_binding(config: Config) -> CMSClient:
    cms = CMSClient(config.cms_origin, cms_token(config), config.storage_origin)
    info = cms.heartbeat(synced=False)
    if info.get("collectionName") and info["collectionName"] != config.collection_name:
        raise BridgeError("instagram_collection_mismatch")
    return cms


def resume(state_dir: Path) -> None:
    require_terminal()
    print("Retome somente depois de resolver a causa do bloqueio. A sessão salva será validada sem fazer login automático.")
    if prompt("Para validar a conexão e autorizar a retomada, digite RETOMAR") != "RETOMAR":
        raise BridgeError("resume_not_confirmed")
    config = load_config(state_dir)
    if not config.account_id or not config.collection_id:
        raise BridgeError("login_required")
    validate_cms_binding(config)
    adapter = InstagramClient(config, state_dir / "session.json")
    adapter.validate_binding()
    adapter.save()
    clear_block(state_dir)
    print("Sessão, coleção e autorização do CMS validadas. A sincronização pode ser retomada.")


def cleanup_abandoned_transfers(state_dir: Path) -> None:
    # Called only after acquiring the process lock. A killed process may leave a
    # temporary transfer directory, but no media is retained on the next start.
    for path in state_dir.glob("transfer-*"):
        if not path.is_symlink() and path.is_dir() and path.stat().st_uid == os.geteuid():
            shutil.rmtree(path)


def send_failure(cms: CMSClient, error: BridgeError) -> None:
    with contextlib.suppress(BridgeError):
        cms.heartbeat(synced=False, error=error_message(error))


def wait_interruptibly(seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(min(30, max(0, deadline - time.monotonic())))


def synchronize(state_dir: Path, *, once: bool = False, report=None) -> int:
    require_unblocked(state_dir)
    config = load_config(state_dir)
    if not config.account_id or not config.collection_id:
        raise BridgeError("login_required")
    cms = CMSClient(config.cms_origin, cms_token(config), config.storage_origin)
    cleanup_abandoned_transfers(state_dir)
    state = State(state_dir / "state.sqlite3", f"{config.cms_origin}|{config.account_id}|{config.collection_id}")
    adapter = None
    failures = 0
    try:
        while True:
            try:
                if report:
                    report("syncing")
                info = cms.heartbeat(synced=False, error=MESSAGES["reference_pending_retry"] if state.has_failed_pending() else None)
                if info.get("collectionName") and info["collectionName"] != config.collection_name:
                    raise BridgeError("instagram_collection_mismatch")
                if adapter is None:
                    adapter = InstagramClient(config, state_dir / "session.json")
                adapter.validate_binding()
                new_count = discover(adapter, config.collection_id, config.collection_name, state)
                completed = 0
                skipped = 0
                deferred_error = None
                for snapshot in state.pending(MAX_IMPORTS_PER_CYCLE):
                    try:
                        acknowledgement = process_snapshot(snapshot, cms, state_dir)
                    except BridgeError as error:
                        state.defer(snapshot["pk"])
                        if not error.temporary or error.code != "media_unavailable":
                            raise
                        deferred_error = error
                        continue
                    state.acknowledge(snapshot, acknowledgement)
                    if acknowledgement.skipped:
                        skipped += 1
                    else:
                        completed += 1
                adapter.save()
                pending = state.count_pending()
                if deferred_error is None and state.has_failed_pending():
                    deferred_error = BridgeError("reference_pending_retry", temporary=True)
                cms.heartbeat(synced=True, error=error_message(deferred_error) if deferred_error else None)
                print(f"Consulta concluída. {new_count} novas na fila, {completed} confirmadas no CMS, {skipped} já removidas e {pending} pendentes {location()}.", flush=True)
                if deferred_error:
                    show_error(deferred_error)
                failures = 0
                if once:
                    return 1 if deferred_error else 0
                if report:
                    report("waiting")
                wait_interruptibly(config.poll_seconds + random.uniform(0, 30))
            except BridgeError as error:
                # Persist before notifying any remote service or releasing the
                # lock. A container restart must not repeat a rejected action.
                if not error.temporary:
                    block_service(state_dir, error)
                    if report:
                        report("blocked", error.code)
                send_failure(cms, error)
                show_error(error)
                if once or not error.temporary:
                    return 1
                failures += 1
                delay = min(3600, config.poll_seconds * (2 ** min(failures - 1, 4)))
                if report:
                    report("retrying", error.code)
                wait_interruptibly(delay + random.uniform(0, 30))
    finally:
        state.close()


def recheck_cms_pause(state_dir: Path, blocked: dict, probe: dict) -> bool:
    """Reauthorize a CMS-only pause without creating any Instagram client.

An Instagram challenge stays manual even if an unsuccessful resume also
encounters an invalid CMS token. A restarted process always waits at least one
full polling interval before its first CMS-only retry.
"""
    if blocked["code"] != "cms_connection_refused" or blocked["manual_required"]:
        probe.clear()
        return False
    signature = (blocked["code"], blocked["since"], blocked["manual_required"])
    now = time.monotonic()
    if probe.get("signature") != signature:
        probe.update(signature=signature, next_attempt=now + POLL_SECONDS, failures=0)
        return False
    if now < probe["next_attempt"]:
        return False
    try:
        validate_cms_binding(load_config(state_dir))
    except BridgeError as error:
        if not error.temporary and error.code != "cms_connection_refused":
            block_service(state_dir, error)
            probe.clear()
        else:
            probe["failures"] += 1
            delay = min(3600, POLL_SECONDS * (2 ** min(probe["failures"] - 1, 4)))
            probe["next_attempt"] = time.monotonic() + delay + random.uniform(0, 30)
        show_error(error)
        return False
    clear_block(state_dir)
    probe.clear()
    print("A conexão voltou a ser autorizada pelo CMS. A sincronização será retomada.", flush=True)
    return True


def serve(state_dir: Path) -> int:
    """Keep one daemon alive; release bridge.lock while intervention is needed."""
    probe: dict[str, Any] = {}
    last_reason = None
    with daemon_lock(state_dir):
        try:
            write_status(state_dir, "starting")
            while True:
                try:
                    with process_lock(state_dir):
                        try:
                            blocked = read_block(state_dir)
                            if blocked:
                                write_status(state_dir, "blocked", blocked["code"])
                                if last_reason != blocked["code"]:
                                    show_error(BridgeError(blocked["code"]))
                                    print("Serviço aguardando intervenção. A fila está preservada.", flush=True)
                                    last_reason = blocked["code"]
                                if recheck_cms_pause(state_dir, blocked, probe):
                                    continue
                            else:
                                probe.clear()
                                last_reason = None
                                synchronize(state_dir, report=lambda phase, reason=None: write_status(state_dir, phase, reason))
                        except BridgeError as error:
                            # Errors before synchronize opens its queue, such as
                            # missing setup, must also survive container restarts.
                            block_service(state_dir, error)
                            write_status(state_dir, "blocked", error.code)
                            show_error(error)
                        except (OSError, ValueError):
                            block_service(state_dir, BridgeError("local_io_error"))
                            write_status(state_dir, "blocked", "local_io_error")
                            show_error(BridgeError("local_io_error"))
                        except Exception:
                            block_service(state_dir, BridgeError("unexpected_error"))
                            write_status(state_dir, "blocked", "unexpected_error")
                            show_error(BridgeError("unexpected_error"))
                except BridgeError as error:
                    if error.code != "already_running":
                        raise
                    # An interactive operation or legacy run already owns the
                    # queue. Do not clean temporary transfers or start a client.
                    write_status(state_dir, "busy", "already_running")
                wait_interruptibly(IDLE_SECONDS)
        finally:
            with contextlib.suppress(BridgeError, OSError, ValueError):
                write_status(state_dir, "stopped")


def status(state_dir: Path, *, healthcheck: bool = False, as_json: bool = False) -> int:
    current = local_status(state_dir)
    code = health_exit_code(current)
    if healthcheck:
        # Docker reserves exit 2; the human/JSON command retains that distinction.
        return 0 if code == 0 else 1
    if as_json:
        print(json.dumps(current, ensure_ascii=False, separators=(",", ":")))
        return code
    labels = {
        "starting": "Serviço iniciando.", "syncing": "Serviço processando uma consulta.",
        "waiting": "Serviço aguardando o próximo ciclo.", "retrying": "Serviço aguardando uma nova tentativa.",
        "blocked": "Serviço aguardando intervenção.", "busy": "Há outra operação usando a fila.",
        "stopped": "Serviço parado.",
    }
    print(labels[current["phase"]])
    if current["reason"]:
        print(error_message(BridgeError(current["reason"])))
    print("Este status é local e não confirma uma nova consulta ao Instagram ou ao CMS.")
    return code


def execute_interactive_or_legacy(state_dir: Path, args) -> int:
    with process_lock(state_dir):
        try:
            if args.command == "setup":
                setup(state_dir)
            elif args.command == "login":
                login(state_dir, renew=args.renew, two_factor=args.two_factor)
            elif args.command == "resume":
                resume(state_dir)
            else:
                return synchronize(state_dir, once=args.command == "once")
            return 0
        except BridgeError as error:
            if not error.temporary and error.code not in {
                "already_running", "service_blocked", "interactive_required",
                "consent_required", "resume_not_confirmed",
            }:
                block_service(state_dir, error)
            raise
        except (OSError, ValueError):
            block_service(state_dir, BridgeError("local_io_error"))
            raise
        except Exception:
            block_service(state_dir, BridgeError("unexpected_error"))
            raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sincroniza uma coleção de Salvos com o CarolOS a partir de um conector privado.")
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE, help="Pasta privada fora de qualquer repositório Git")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("setup", help="Autorizar a integração e configurar o CMS")
    login_parser = commands.add_parser("login", help="Conectar a conta do Instagram no ambiente escolhido")
    login_parser.add_argument("--renew", action="store_true", help="Renovar explicitamente uma sessão rejeitada após conferir o app oficial")
    login_parser.add_argument("--two-factor", action="store_true", help="Informar localmente um código legítimo da autenticação de dois fatores")
    commands.add_parser("once", help="Consultar uma vez e processar até dez referências pendentes")
    commands.add_parser("run", help="Manter consultas a cada cinco minutos enquanto este processo estiver ativo")
    commands.add_parser("serve", help="Executar como serviço persistente e aguardar intervenção em caso de bloqueio")
    commands.add_parser("resume", help="Validar explicitamente a sessão salva e liberar um bloqueio")
    status_parser = commands.add_parser("status", help="Consultar somente o estado local do serviço, sem acesso à rede")
    status_parser.add_argument("--healthcheck", action="store_true", help="Retornar apenas o código de saúde local")
    status_parser.add_argument("--json", action="store_true", help="Exibir somente o estado operacional sem dados da conta")
    args = parser.parse_args(argv)
    try:
        if os.name != "posix":
            raise BridgeError("unsupported_platform")
        os.umask(0o077)
        state_dir = private_directory(args.state_dir, repo_root=REPO_ROOT)
        with handle_termination():
            if args.command == "serve":
                return serve(state_dir)
            if args.command == "status":
                return status(state_dir, healthcheck=args.healthcheck, as_json=args.json)
            return execute_interactive_or_legacy(state_dir, args)
    except ServiceStopped:
        print("Conector parado. O progresso foi preservado.", flush=True)
        return 0
    except KeyboardInterrupt:
        print("Conector parado. O progresso local foi preservado.")
        return 130
    except BridgeError as error:
        show_error(error)
        return 1
    except (OSError, ValueError):
        show_error(BridgeError("local_io_error"))
        return 1
    except Exception:
        # Raw tracebacks may contain signed URLs, tokens or session fields.
        print("O conector parou por um erro inesperado. O progresso local foi preservado. Revise a instalação sem compartilhar credenciais ou arquivos de sessão.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
