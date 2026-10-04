"""Local-only state and bounded HTTPS intake for the CarolOS saves bridge.

This module uses only the standard library so security and recovery tests do not
need an Instagram account, third-party packages, or a network connection.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import fcntl
import http.client
import ipaddress
import json
import os
import re
import socket
import sqlite3
import ssl
import stat
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Mapping
from urllib.parse import parse_qs, unquote, urljoin, urlsplit


POLL_SECONDS = 300
MAX_ASSET_BYTES = 50 * 1024 * 1024
MAX_TOTAL_BYTES = 80 * 1024 * 1024
MAX_ASSETS = 10
HEAD_ITEMS = 50
MAX_HEAD_PAGES = 4
MAX_RESPONSE_BYTES = 1024 * 1024
CONNECT_TIMEOUT = 15
READ_TIMEOUT = 45
TRANSFER_SECONDS = 180
CDN_DOMAINS = ("cdninstagram.com", "fbcdn.net")
STORAGE_PREFIX = "/storage/v1/object/upload/sign/"
MIMES = {
    "video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/png",
    "image/webp", "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg",
}


class BridgeError(Exception):
    """A public error code. Never place server responses or secrets in it."""

    def __init__(self, code: str, *, temporary: bool = False):
        super().__init__(code)
        self.code = code
        self.temporary = temporary


class UnavailableAsset(BridgeError):
    """No authorized media bytes were returned. Do not circumvent the failure."""


class RejectedAsset(BridgeError):
    """A permanently unsupported/over-limit file; retain a metadata reference."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def get_field(value: Any, name: str, default: Any = None) -> Any:
    return value.get(name, default) if isinstance(value, Mapping) else getattr(value, name, default)


def short_text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    # Keep natural-language line breaks, but do not forward terminal control codes.
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))[:limit]


def public_ip(raw: str) -> bool:
    try:
        address = ipaddress.ip_address(raw.split("%", 1)[0])
        return bool(address.is_global and not address.is_multicast and not address.is_reserved)
    except ValueError:
        return False


def parse_https(raw: str):
    if not isinstance(raw, str) or len(raw) > 16384 or any(ord(c) < 33 for c in raw) or "\\" in raw:
        raise BridgeError("unsafe_url")
    try:
        url = urlsplit(raw)
        port = url.port
    except ValueError:
        raise BridgeError("unsafe_url") from None
    host = url.hostname or ""
    if (url.scheme != "https" or url.username is not None or url.password is not None
            or port not in (None, 443) or url.fragment or not host.isascii()
            or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", host)
            or ".." in host or "." not in host):
        raise BridgeError("unsafe_url")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise BridgeError("unsafe_url")
    return url


def normalized_origin(raw: str) -> str:
    url = parse_https(raw.strip() if isinstance(raw, str) else raw)
    if url.path not in ("", "/") or url.query:
        raise BridgeError("invalid_origin")
    return "https://" + str(url.hostname).lower()


def validate_cdn_url(raw: str) -> str:
    url = parse_https(raw)
    host = str(url.hostname).lower()
    if not any(host == domain or host.endswith("." + domain) for domain in CDN_DOMAINS):
        raise BridgeError("untrusted_media_host")
    return raw


def validate_upload_target(target: Mapping[str, Any], storage_origin: str) -> str:
    raw = target.get("signedUrl")
    url = parse_https(raw)
    if "https://" + str(url.hostname).lower() != normalized_origin(storage_origin):
        raise BridgeError("untrusted_storage_host")
    path = target.get("path")
    token = target.get("token")
    decoded = unquote(url.path)
    if (not isinstance(path, str) or not path or path.startswith("/")
            or any(p in (".", "..", "") for p in path.split("/"))
            or "\\" in path or not decoded.startswith(STORAGE_PREFIX)
            or any(p in (".", "..") for p in decoded.split("/"))
            or not decoded.endswith("/" + path)):
        raise BridgeError("invalid_upload_target")
    # A signed ticket may only name one object and one matching scoped token.
    query = parse_qs(url.query, keep_blank_values=True)
    if not isinstance(token, str) or not token or query.get("token") != [token]:
        raise BridgeError("invalid_upload_target")
    return raw


def resolve_public(host: str) -> list[str]:
    try:
        addresses = list(dict.fromkeys(
            entry[4][0] for entry in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        ))
    except OSError:
        raise BridgeError("network_unavailable", temporary=True) from None
    if not addresses or not all(public_ip(address) for address in addresses):
        raise BridgeError("private_network_refused")
    return addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Resolve once, connect to that public address, verify TLS against the host.

    No second DNS lookup is used for the socket. http.client does not honor proxy
    environment variables, read .netrc, preserve cookies, or follow redirects.
    """

    def __init__(self, hostname: str, address: str):
        super().__init__(hostname, port=443, timeout=READ_TIMEOUT, context=ssl.create_default_context())
        self.pinned_address = address

    def connect(self) -> None:
        sock = socket.create_connection((self.pinned_address, 443), timeout=CONNECT_TIMEOUT)
        try:
            sock.settimeout(READ_TIMEOUT)
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


class HTTPTransport:
    @contextlib.contextmanager
    def request(self, method: str, raw_url: str, *, headers: Mapping[str, str] | None = None,
                body: Any = None) -> Iterator[Any]:
        url = parse_https(raw_url)
        hostname = str(url.hostname).lower()
        address = resolve_public(hostname)[0]
        connection = PinnedHTTPSConnection(hostname, address)
        request_path = (url.path or "/") + (("?" + url.query) if url.query else "")
        expired = threading.Event()
        timer = None
        try:
            # An absolute request deadline also covers slow response headers,
            # chunk framing and a storage server reading an upload very slowly.
            # TCP/TLS happen before this timer and have explicit socket limits.
            # DNS resolution follows the operating system's resolver settings.
            connection.connect()
            active_socket = connection.sock

            def stop_expired_transfer():
                expired.set()
                with contextlib.suppress(OSError):
                    active_socket.shutdown(socket.SHUT_RDWR)

            timer = threading.Timer(TRANSFER_SECONDS, stop_expired_transfer)
            timer.daemon = True
            timer.start()
            connection.request(method, request_path, body=body, headers=dict(headers or {}))
            response = connection.getresponse()
            try:
                yield response
                if expired.is_set():
                    raise BridgeError("network_timeout", temporary=True)
            finally:
                response.close()
        except (OSError, http.client.HTTPException):
            code = "network_timeout" if expired.is_set() else "network_unavailable"
            raise BridgeError(code, temporary=True) from None
        finally:
            if timer is not None:
                timer.cancel()
            connection.close()


def private_directory(path: Path, *, repo_root: Path | None = None) -> Path:
    path = path.expanduser().absolute()
    if path.is_symlink():
        raise BridgeError("unsafe_state_directory")
    resolved = path.resolve()
    if repo_root and (resolved == repo_root.resolve() or repo_root.resolve() in resolved.parents):
        raise BridgeError("state_inside_repository")
    if any((parent / ".git").exists() for parent in [resolved, *resolved.parents]):
        raise BridgeError("state_inside_repository")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid():
        raise BridgeError("unsafe_state_directory")
    os.chmod(path, 0o700)
    return path


def _safe_file(path: Path) -> None:
    if path.is_symlink():
        raise BridgeError("unsafe_state_file")
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise BridgeError("unsafe_state_file")


def write_private_json(path: Path, value: Any) -> None:
    _safe_file(path)
    descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)


def read_private_json(path: Path) -> dict[str, Any]:
    _safe_file(path)
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, encoding="utf-8") as stream:
            data = json.load(stream)
    except (OSError, ValueError):
        raise BridgeError("invalid_local_config") from None
    if not isinstance(data, dict):
        raise BridgeError("invalid_local_config")
    return data


@contextlib.contextmanager
def process_lock(state_dir: Path):
    path = state_dir / "bridge.lock"
    _safe_file(path)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BridgeError("already_running") from None
        yield
    finally:
        os.close(descriptor)


@dataclass
class Config:
    cms_origin: str
    storage_origin: str
    username: str
    collection_name: str = "CarolOS"
    collection_id: str = ""
    account_id: str = ""
    cms_token: str = ""
    accepted_at: str = ""
    poll_seconds: int = POLL_SECONDS

    @classmethod
    def load(cls, path: Path) -> "Config":
        data = read_private_json(path)
        if data.get("version") != 1 or not data.get("accepted_at"):
            raise BridgeError("setup_required")
        try:
            config = cls(**{name: data[name] for name in cls.__dataclass_fields__ if name in data})
            config.cms_origin = normalized_origin(config.cms_origin)
            config.storage_origin = normalized_origin(config.storage_origin)
            config.username = validate_username(config.username)
            if not isinstance(config.collection_name, str) or not 1 <= len(config.collection_name) <= 100:
                raise ValueError
            if not isinstance(config.poll_seconds, int) or config.poll_seconds < POLL_SECONDS:
                raise ValueError
            if config.account_id and not re.fullmatch(r"\d{1,40}", config.account_id):
                raise ValueError
            if config.collection_id and not re.fullmatch(r"\d{1,40}", config.collection_id):
                raise ValueError
        except (TypeError, ValueError):
            raise BridgeError("invalid_local_config") from None
        return config

    def save(self, path: Path) -> None:
        write_private_json(path, {"version": 1, **self.__dict__})


def validate_username(value: str) -> str:
    username = str(value).strip().lstrip("@").lower()
    if not re.fullmatch(r"[a-z0-9._]{1,30}", username):
        raise BridgeError("invalid_instagram_username")
    return username


def shortcode_from_pk(pk: str) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    number = int(pk)
    result = ""
    while number:
        result = alphabet[number & 63] + result
        number >>= 6
    return result or "A"


def media_snapshot(media: Any) -> dict[str, Any]:
    pk = str(get_field(media, "pk", ""))
    if not re.fullmatch(r"\d{1,40}", pk):
        raise BridgeError("invalid_instagram_response")
    code = str(get_field(media, "code", "") or shortcode_from_pk(pk))
    if not re.fullmatch(r"[A-Za-z0-9_-]{5,64}", code):
        raise BridgeError("invalid_instagram_response")
    kind_number = get_field(media, "media_type", 0)
    media_kind = {1: "image", 2: "reel", 8: "carousel"}.get(kind_number, "unknown")
    caption = short_text(get_field(media, "caption_text", ""), 30000)
    user = get_field(media, "user", {})
    handle = short_text(get_field(user, "username", ""), 100)
    publication = get_field(media, "taken_at")
    published_at = None
    if isinstance(publication, dt.datetime):
        if publication.tzinfo is None:
            publication = publication.replace(tzinfo=dt.timezone.utc)
        published_at = publication.isoformat()
    candidates: list[dict[str, str]] = []

    def append_asset(item: Any, is_video: bool) -> None:
        url = get_field(item, "video_url" if is_video else "thumbnail_url")
        if url and len(candidates) < MAX_ASSETS:
            entry = {"url": str(url), "family": "video" if is_video else "image"}
            if entry not in candidates:
                candidates.append(entry)

    if kind_number == 8:
        resources = get_field(media, "resources", []) or []
        for resource in resources[:MAX_ASSETS]:
            append_asset(resource, get_field(resource, "media_type") == 2)
    else:
        if kind_number == 2:
            append_asset(media, True)
        append_asset(media, False)
    title = short_text(get_field(media, "title", ""), 200).strip()
    if not title:
        title = (caption.strip().splitlines() or [""])[0][:160]
    return {
        "pk": pk,
        "reference": {
            "sourceUrl": f"https://www.instagram.com/p/{code}/",
            "externalId": pk,
            "collectionName": "",  # Assigned from the explicitly selected collection.
            "mediaKind": media_kind,
            "creatorHandle": handle,
            "title": title or (f"Referência de @{handle}" if handle else "Referência do Instagram"),
            "caption": caption,
            "notes": "",
            "publishedAt": published_at,
        },
        "candidates": candidates,
        "omitted_assets": max(0, len(get_field(media, "resources", []) or []) - MAX_ASSETS),
    }


class State:
    """Queue + checkpoint updates are atomic; acknowledgement happens separately."""

    def __init__(self, path: Path, identity: str):
        _safe_file(path)
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.close(descriptor)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=DELETE")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS queue (
                pk TEXT PRIMARY KEY, payload TEXT NOT NULL, first_seen_at TEXT NOT NULL,
                failures INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS seen (
                pk TEXT PRIMARY KEY, source_url TEXT NOT NULL UNIQUE,
                reference_id TEXT NOT NULL, completed_at TEXT NOT NULL
            );
        """)
        old_identity = self.get("identity")
        if old_identity is not None and old_identity != identity:
            self.db.close()
            raise BridgeError("state_identity_mismatch")
        self.set("identity", identity)

    def close(self):
        self.db.close()

    def get(self, key: str, default: str | None = None) -> str | None:
        row = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else default

    def set(self, key: str, value: str) -> None:
        with self.db:
            self.db.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    def _enqueue(self, snapshots: list[dict[str, Any]]) -> int:
        count = 0
        for snapshot in snapshots:
            pk = snapshot["pk"]
            source_url = snapshot["reference"]["sourceUrl"]
            if self.db.execute("SELECT 1 FROM seen WHERE pk=? OR source_url=?", (pk, source_url)).fetchone():
                continue
            existed = self.db.execute("SELECT 1 FROM queue WHERE pk=?", (pk,)).fetchone()
            self.db.execute("""INSERT INTO queue(pk,payload,first_seen_at) VALUES(?,?,?)
                ON CONFLICT(pk) DO UPDATE SET payload=excluded.payload""",
                (pk, json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), utc_now()))
            count += int(existed is None)
        return count

    def enqueue(self, snapshots: list[dict[str, Any]]) -> int:
        with self.db:
            return self._enqueue(snapshots)

    def commit_page(self, snapshots: list[dict[str, Any]], next_cursor: str) -> int:
        with self.db:
            count = self._enqueue(snapshots)
            self.db.execute("INSERT INTO meta(key,value) VALUES('backfill_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (next_cursor,))
            if not next_cursor:
                self.db.execute("INSERT INTO meta(key,value) VALUES('last_full_scan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (utc_now(),))
            return count

    def pending(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.db.execute("SELECT payload FROM queue WHERE next_attempt<=? ORDER BY failures, first_seen_at, pk LIMIT ?", (time.time(), limit)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def acknowledge(self, snapshot: Mapping[str, Any], acknowledgement: "IntakeAck") -> None:
        if not acknowledgement.skipped:
            try:
                uuid.UUID(acknowledgement.reference_id)
            except (ValueError, TypeError, AttributeError):
                raise BridgeError("invalid_cms_response") from None
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO seen(pk,source_url,reference_id,completed_at) VALUES(?,?,?,?)",
                            (snapshot["pk"], snapshot["reference"]["sourceUrl"], acknowledgement.reference_id or "skipped", utc_now()))
            self.db.execute("DELETE FROM queue WHERE pk=?", (snapshot["pk"],))

    def defer(self, pk: str) -> None:
        row = self.db.execute("SELECT failures FROM queue WHERE pk=?", (pk,)).fetchone()
        failures = (row[0] if row else 0) + 1
        delay = min(3600, POLL_SECONDS * (2 ** min(failures - 1, 4)))
        with self.db:
            self.db.execute("UPDATE queue SET failures=?,next_attempt=? WHERE pk=?", (failures, time.time() + delay, pk))

    def count_pending(self) -> int:
        return int(self.db.execute("SELECT count(*) FROM queue").fetchone()[0])

    def has_failed_pending(self) -> bool:
        return self.db.execute("SELECT 1 FROM queue WHERE failures>0 LIMIT 1").fetchone() is not None


def discover(client: Any, collection_id: str, collection_name: str, state: State) -> int:
    """Visit the head every cycle and advance one full-scan page independently.

    The background scan restarts when exhausted and never stops on a known item.
    This repairs gaps after >50 new saves and does not assume ordering by save or
    publication time. Missing a post during concurrent removals is repaired by
    the next complete pass, without deleting anything already imported.
    """
    pages: dict[str, tuple[list[Any], str]] = {}

    def fetch(cursor: str) -> tuple[list[Any], str]:
        if cursor not in pages:
            media, next_cursor = client.collection_page(collection_id, cursor)
            if not isinstance(media, list) or len(media) > 1000 or not isinstance(next_cursor, str):
                raise BridgeError("invalid_instagram_response")
            if len(next_cursor) > 16384:
                raise BridgeError("invalid_instagram_response")
            if next_cursor and next_cursor == cursor:
                raise BridgeError("instagram_cursor_stalled", temporary=True)
            pages[cursor] = media, next_cursor
        return pages[cursor]

    def convert(items: list[Any]) -> list[dict[str, Any]]:
        snapshots = [media_snapshot(media) for media in items]
        for snapshot in snapshots:
            snapshot["reference"]["collectionName"] = collection_name
        return snapshots

    discovered = 0
    head_cursor = ""
    count = 0
    for _ in range(MAX_HEAD_PAGES):
        items, next_cursor = fetch(head_cursor)
        selected = items[:HEAD_ITEMS - count]
        discovered += state.enqueue(convert(selected))
        count += len(selected)
        if count >= HEAD_ITEMS or not next_cursor:
            break
        head_cursor = next_cursor
    cursor = state.get("backfill_cursor", "") or ""
    items, next_cursor = fetch(cursor)
    discovered += state.commit_page(convert(items), next_cursor)
    return discovered


@dataclass
class Asset:
    path: Path
    mime_type: str
    size: int

    def spec(self) -> dict[str, Any]:
        return {"mimeType": self.mime_type, "size": self.size}


@dataclass(frozen=True)
class IntakeAck:
    reference_id: str | None
    skipped: bool = False


def detect_mime(prefix: bytes, declared: str) -> str:
    declared = declared.partition(";")[0].strip().lower()
    if prefix.startswith(b"\xff\xd8\xff"):
        found = "image/jpeg"
    elif prefix.startswith(b"\x89PNG\r\n\x1a\n"):
        found = "image/png"
    elif prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP":
        found = "image/webp"
    elif prefix[:4] == b"RIFF" and prefix[8:12] == b"WAVE":
        found = "audio/wav"
    elif prefix.startswith(b"OggS"):
        found = "audio/ogg"
    elif prefix.startswith(b"ID3") or (len(prefix) > 1 and prefix[0] == 255 and prefix[1] & 0xE0 == 0xE0):
        found = "audio/mpeg"
    elif len(prefix) >= 12 and prefix[4:8] == b"ftyp":
        found = "audio/mp4" if declared == "audio/mp4" else ("video/quicktime" if prefix[8:12] == b"qt  " else "video/mp4")
    elif prefix.startswith(b"\x1aE\xdf\xa3"):
        found = "audio/webm" if declared == "audio/webm" else "video/webm"
    else:
        raise RejectedAsset("unsupported_media_type")
    aliases = {"image/jpg": "image/jpeg", "audio/x-wav": "audio/wav", "video/x-m4v": "video/mp4"}
    declared = aliases.get(declared, declared)
    if declared not in ("", "application/octet-stream", "binary/octet-stream", found):
        raise RejectedAsset("media_type_mismatch")
    return found


def download_asset(transport: Any, candidate: Mapping[str, str], directory: Path,
                   remaining: int, *, index: int = 0) -> Asset:
    url = validate_cdn_url(candidate["url"])
    maximum = min(MAX_ASSET_BYTES, remaining)
    if maximum <= 0:
        raise RejectedAsset("media_size_limit")
    started = time.monotonic()
    for hop in range(4):
        # Validate every redirect, before any connection. No authorization/cookie
        # is ever supplied to the downloader or carried across redirects.
        validate_cdn_url(url)
        with transport.request("GET", url, headers={"Accept-Encoding": "identity", "User-Agent": "CarolOS-local-reference-bridge/1"}) as response:
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location or hop == 3:
                    raise RejectedAsset("media_redirect_limit")
                url = validate_cdn_url(urljoin(url, location))
                continue
            if response.status in (401, 403, 404, 410):
                raise UnavailableAsset("media_unavailable", temporary=True)
            if response.status == 429 or response.status >= 500:
                raise BridgeError("media_temporarily_unavailable", temporary=True)
            if response.status != 200:
                raise RejectedAsset("media_response_rejected")
            if response.getheader("Content-Encoding", "identity").lower() not in ("", "identity"):
                raise RejectedAsset("compressed_media_refused")
            length = response.getheader("Content-Length")
            if length:
                try:
                    if int(length) <= 0 or int(length) > maximum:
                        raise RejectedAsset("media_size_limit")
                except ValueError:
                    raise RejectedAsset("invalid_media_length") from None
            descriptor, raw_path = tempfile.mkstemp(prefix=f"asset-{index}-", dir=directory)
            path = Path(raw_path)
            total = 0
            prefix = bytearray()
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    while True:
                        if time.monotonic() - started > TRANSFER_SECONDS:
                            raise BridgeError("media_timeout", temporary=True)
                        # read1 makes progress after one buffered socket read;
                        # the transport watchdog covers slow/chunked peers too.
                        read = getattr(response, "read1", response.read)
                        chunk = read(min(65536, maximum - total + 1))
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > maximum:
                            raise RejectedAsset("media_size_limit")
                        if len(prefix) < 512:
                            prefix.extend(chunk[:512 - len(prefix)])
                        stream.write(chunk)
                if total == 0 or (length and total != int(length)):
                    raise BridgeError("incomplete_media", temporary=True)
                mime = detect_mime(bytes(prefix), response.getheader("Content-Type", ""))
                if candidate.get("family") == "image" and not mime.startswith("image/"):
                    raise RejectedAsset("media_type_mismatch")
                if candidate.get("family") == "video" and not mime.startswith(("video/", "audio/")):
                    raise RejectedAsset("media_type_mismatch")
                return Asset(path, mime, total)
            except BaseException:
                with contextlib.suppress(FileNotFoundError):
                    path.unlink()
                raise
    raise RejectedAsset("media_redirect_limit")


class CMSClient:
    def __init__(self, origin: str, token: str, storage_origin: str = "", transport: Any = None):
        self.origin = normalized_origin(origin)
        if not isinstance(token, str) or not token or len(token) > 4096 or any(ord(c) < 33 for c in token):
            raise BridgeError("cms_token_required")
        self._token = token
        self.storage_origin = normalized_origin(storage_origin) if storage_origin else ""
        self.transport = transport or HTTPTransport()

    def call(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(body) > MAX_RESPONSE_BYTES:
            raise BridgeError("intake_too_large")
        # The token is bound to exactly this HTTPS origin and route. No redirects.
        with self.transport.request("POST", self.origin + "/api/references/ingest", headers={
            "Authorization": "Bearer " + self._token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "Content-Length": str(len(body)),
        }, body=body) as response:
            if response.status in (401, 403):
                raise BridgeError("cms_connection_refused")
            if response.status == 429 or response.status >= 500:
                raise BridgeError("cms_temporarily_unavailable", temporary=True)
            if not 200 <= response.status < 300:
                raise BridgeError("cms_request_rejected")
            raw = bytearray()
            read = getattr(response, "read1", response.read)
            while True:
                chunk = read(min(65536, MAX_RESPONSE_BYTES - len(raw) + 1))
                if not chunk:
                    break
                raw.extend(chunk)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise BridgeError("invalid_cms_response")
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                raise BridgeError("invalid_cms_response") from None
        if not isinstance(data, dict):
            raise BridgeError("invalid_cms_response")
        if data.get("ok") is False:
            raise BridgeError("cms_request_rejected")
        return data

    def heartbeat(self, *, synced: bool, error: str | None = None) -> dict[str, Any]:
        data = self.call({"action": "heartbeat", "synced": synced, "error": error})
        reported = normalized_origin(data.get("storageOrigin", ""))
        if self.storage_origin and self.storage_origin != reported:
            raise BridgeError("storage_origin_changed")
        interval = data.get("pollSeconds", POLL_SECONDS)
        if type(interval) is not int or interval < POLL_SECONDS:
            raise BridgeError("invalid_cms_response")
        return data

    def complete(self, reference_id: str, upload_batch_id: str | None = None) -> None:
        payload = {"action": "complete", "id": reference_id}
        if upload_batch_id is not None:
            payload["uploadBatchId"] = upload_batch_id
        data = self.call(payload)
        if data.get("id") != reference_id or not (data.get("completed") is True or data.get("ok") is True):
            raise BridgeError("incomplete_cms_acknowledgement")

    def upload(self, asset: Asset, target: Mapping[str, Any]) -> None:
        url = validate_upload_target(target, self.storage_origin)
        if target.get("mimeType") != asset.mime_type or target.get("size") != asset.size:
            raise BridgeError("upload_spec_mismatch")
        with asset.path.open("rb") as stream:
            with self.transport.request("PUT", url, headers={
                "Content-Type": asset.mime_type,
                "Content-Length": str(asset.size),
                "Cache-Control": "max-age=0",
                "x-upsert": "false",
            }, body=stream) as response:
                if response.status == 409:
                    # A previous PUT may have succeeded before a connection broke.
                    # The following complete still verifies real size/MIME server-side.
                    return
                if response.status == 429 or response.status >= 500:
                    raise BridgeError("upload_temporarily_unavailable", temporary=True)
                if not 200 <= response.status < 300:
                    raise BridgeError("upload_rejected", temporary=response.status in (401, 403))

    def import_reference(self, reference: Mapping[str, Any], assets: list[Asset]) -> IntakeAck:
        data = self.call({"action": "import", "reference": {**reference, "assets": [asset.spec() for asset in assets]}})
        reference_id = data.get("id")
        targets = data.get("uploads")
        if (data.get("skipped") is True and data.get("ok") is True
                and reference_id is None and data.get("duplicate") is True and targets == []):
            return IntakeAck(None, skipped=True)
        try:
            uuid.UUID(reference_id)
        except (ValueError, TypeError, AttributeError):
            raise BridgeError("invalid_cms_response") from None
        if not isinstance(data.get("duplicate"), bool) or not isinstance(targets, list) or len(targets) > len(assets):
            raise BridgeError("invalid_cms_response")
        # The server verifies completed batches before returning this ACK. It
        # also covers an existing manually imported item outside this token's scope.
        if data["duplicate"] and not targets:
            return IntakeAck(reference_id)
        batch_id = data.get("uploadBatchId")
        if batch_id is not None:
            try:
                uuid.UUID(batch_id)
            except (ValueError, TypeError, AttributeError):
                raise BridgeError("invalid_cms_response") from None
        indices: set[int] = set()
        for target in targets:
            if not isinstance(target, dict):
                raise BridgeError("invalid_upload_target")
            index = target.get("index")
            if type(index) is not int or index in indices or index < 0 or index >= len(assets):
                raise BridgeError("invalid_upload_target")
            indices.add(index)
            self.upload(assets[index], target)
        self.complete(reference_id, batch_id)
        return IntakeAck(reference_id)


def process_snapshot(snapshot: dict[str, Any], cms: CMSClient, state_dir: Path,
                     transport: Any = None) -> IntakeAck:
    transport = transport or HTTPTransport()
    assets: list[Asset] = []
    warnings: list[str] = []
    if snapshot.get("omitted_assets", 0):
        warnings.append(f"A referência tem {int(snapshot['omitted_assets'])} arquivos adicionais que não foram importados devido ao limite de 10 arquivos. A análise deve considerar esse recorte.")
    if snapshot["reference"].get("mediaKind") == "reel" and not any(
        candidate.get("family") == "video" for candidate in snapshot.get("candidates", [])
    ):
        warnings.append("O Instagram não forneceu o vídeo nem o áudio. A imagem e a legenda não permitem transcrever as falas.")
    total = 0
    with tempfile.TemporaryDirectory(prefix="transfer-", dir=state_dir) as raw_dir:
        directory = Path(raw_dir)
        os.chmod(directory, 0o700)
        for index, candidate in enumerate(snapshot.get("candidates", [])[:MAX_ASSETS]):
            try:
                asset = download_asset(transport, candidate, directory, MAX_TOTAL_BYTES - total, index=index)
            except RejectedAsset:
                warnings.append("Parte da mídia excede os limites do conector ou usa um formato não suportado.")
                continue
            except BridgeError as error:
                if error.code in ("unsafe_url", "untrusted_media_host", "private_network_refused"):
                    warnings.append("Uma mídia não foi recebida de uma origem autorizada pelo conector.")
                    continue
                # A denied/expired media URL is retried using newly collected
                # collection data later. Never mark such a reference as seen.
                raise
            assets.append(asset)
            total += asset.size
        reference = dict(snapshot["reference"])
        if not assets:
            warnings.append("O Instagram não forneceu mídia utilizável. A referência contém somente o material de texto disponível.")
        reference["notes"] = "\n".join(dict.fromkeys(warnings))[:6000]
        return cms.import_reference(reference, assets)
