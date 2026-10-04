"""Private, local-only lifecycle state for the persistent bridge process.

The daemon lock prevents duplicate services. The existing bridge.lock belongs
only to a synchronization or an interactive operation, so a blocked daemon can
release it while continuing to report its state. Nothing in this module makes a
network request or reads Instagram credentials.
"""

from __future__ import annotations

import contextlib
import fcntl
import os
from pathlib import Path
import re
import signal
import stat
from typing import Iterator

from bridge_core import BridgeError, read_private_json, utc_now, write_private_json


BLOCK_FILE = "blocked.json"
STATUS_FILE = "service.json"
DAEMON_LOCK_FILE = "service.lock"
IDLE_SECONDS = 30
PHASES = {"starting", "syncing", "waiting", "retrying", "blocked", "busy", "stopped"}
_termination_deferral_depth = 0
_termination_requested = False


class ServiceStopped(BaseException):
    """SIGTERM unwinds transfer/SQLite context managers without being retried."""


def _stop_for_termination() -> None:
    # Further stop signals must not interrupt the cleanup already in progress.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    raise ServiceStopped()


@contextlib.contextmanager
def handle_termination() -> Iterator[None]:
    def stop(_signum, _frame):
        global _termination_requested
        if _termination_deferral_depth:
            # A process-directed signal can reach another unmasked thread and
            # schedule this Python handler on the main thread. The POSIX mask
            # alone does not cover that path.
            _termination_requested = True
            return
        _stop_for_termination()

    previous = signal.signal(signal.SIGTERM, stop)
    try:
        yield
    finally:
        signal.signal(signal.SIGTERM, previous)


@contextlib.contextmanager
def _durable_block_write() -> Iterator[None]:
    """Deliver SIGTERM only after the recognized block is durable on disk."""
    global _termination_deferral_depth, _termination_requested
    _termination_deferral_depth += 1
    previous_mask = None
    try:
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM})
        yield
    finally:
        try:
            if previous_mask is not None:
                # Keep handler deferral active during unmasking itself because
                # pthread_sigmask can synchronously deliver a pending signal.
                signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        finally:
            _termination_deferral_depth -= 1
        if _termination_deferral_depth == 0 and _termination_requested:
            _termination_requested = False
            _stop_for_termination()


def _safe_code(value: object) -> str:
    return value if isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,79}", value) else "unexpected_error"


def _sync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def read_block(state_dir: Path) -> dict | None:
    path = state_dir / BLOCK_FILE
    if not path.exists() and not path.is_symlink():
        return None
    data = read_private_json(path)
    if data.get("version") != 1 or _safe_code(data.get("code")) != data.get("code") or not isinstance(data.get("since"), str):
        raise BridgeError("invalid_local_config")
    # Do not return arbitrary fields even if the state was manually edited.
    manual_required = data.get("manual_required", data["code"] != "cms_connection_refused")
    if not isinstance(manual_required, bool):
        raise BridgeError("invalid_local_config")
    return {"code": data["code"], "since": data["since"], "manual_required": manual_required}


def block_service(state_dir: Path, error: BridgeError) -> None:
    """Must be called under bridge.lock, before releasing a failed operation."""
    if error.code in {"already_running", "service_blocked"}:
        return
    with _durable_block_write():
        previous = read_block(state_dir)
        write_private_json(state_dir / BLOCK_FILE, {
            "version": 1, "code": _safe_code(error.code), "since": utc_now(),
            # A failed manual recovery cannot turn an Instagram challenge into a
            # CMS-only pause that would later resume automatically.
            "manual_required": error.code != "cms_connection_refused" or bool(previous and previous["manual_required"]),
        })
        _sync_directory(state_dir)


def clear_block(state_dir: Path) -> None:
    """Called after manual validation or reauthorization of a CMS-only pause."""
    if read_block(state_dir) is not None:
        (state_dir / BLOCK_FILE).unlink()
        _sync_directory(state_dir)


def require_unblocked(state_dir: Path) -> None:
    if read_block(state_dir) is not None:
        raise BridgeError("service_blocked")


def write_status(state_dir: Path, phase: str, reason: str | None = None) -> None:
    if phase not in PHASES:
        raise ValueError("invalid service phase")
    write_private_json(state_dir / STATUS_FILE, {
        "version": 1, "phase": phase, "reason": _safe_code(reason) if reason else None,
        "updated_at": utc_now(),
    })


def _open_lock(path: Path, *, create: bool) -> int:
    flags = (os.O_CREAT | os.O_RDWR) if create else os.O_RDONLY
    try:
        descriptor = os.open(path, flags | os.O_NOFOLLOW, 0o600)
    except FileNotFoundError:
        if not create:
            return -1
        raise
    info = os.fstat(descriptor)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        os.close(descriptor)
        raise BridgeError("unsafe_state_file")
    return descriptor


@contextlib.contextmanager
def daemon_lock(state_dir: Path) -> Iterator[None]:
    descriptor = _open_lock(state_dir / DAEMON_LOCK_FILE, create=True)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BridgeError("already_running") from None
        yield
    finally:
        os.close(descriptor)


def _lock_taken(path: Path) -> bool:
    descriptor = _open_lock(path, create=False)
    if descriptor < 0:
        return False
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        return False
    finally:
        os.close(descriptor)


def local_status(state_dir: Path) -> dict:
    """Use advisory locks instead of PIDs that differ across Docker namespaces."""
    blocked = read_block(state_dir)
    daemon_active = _lock_taken(state_dir / DAEMON_LOCK_FILE)
    worker_active = _lock_taken(state_dir / "bridge.lock")
    phase = "stopped"
    reason = None
    updated_at = None
    path = state_dir / STATUS_FILE
    if path.exists() or path.is_symlink():
        data = read_private_json(path)
        if data.get("version") != 1 or data.get("phase") not in PHASES:
            raise BridgeError("invalid_local_config")
        if daemon_active:
            phase = data["phase"]
            reason = _safe_code(data["reason"]) if data.get("reason") else None
        # Only a timestamp-shaped value may leave this private file.
        if isinstance(data.get("updated_at"), str) and re.fullmatch(r"[0-9T:.+Z-]{15,40}", data["updated_at"]):
            updated_at = data["updated_at"]
    if blocked:
        phase, reason = "blocked", blocked["code"]
    elif not (state_dir / "config.json").exists():
        reason = "setup_required"
    return {
        "phase": phase, "reason": reason, "daemon_active": daemon_active,
        "worker_active": worker_active, "updated_at": updated_at,
    }


def health_exit_code(status: dict) -> int:
    if status["phase"] == "blocked" or status["reason"] in {"setup_required", "login_required"}:
        return 2
    if status["daemon_active"] and status["phase"] in {"syncing", "waiting", "retrying"}:
        return 0
    return 1
