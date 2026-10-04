"""Adversarial bridge tests without Instagram, dependencies, or network access."""

from __future__ import annotations

import contextlib
import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bridge_core as bridge


def instagram_media(pk: int) -> dict:
    return {
        "pk": str(pk),
        "code": "Media" + str(pk),
        "media_type": 1,
        "caption_text": "A reference caption",
        "taken_at": dt.datetime(2001, 1, 1),
    }


class FakeResponse:
    def __init__(self, status=200, *, data=None, headers=None, raw=None):
        self.status = status
        self.headers = headers or {}
        self.raw = raw if raw is not None else json.dumps(data or {}).encode()
        self.position = 0

    def getheader(self, name, default=None):
        return next(
            (value for key, value in self.headers.items() if key.lower() == name.lower()),
            default,
        )

    def read(self, amount=-1):
        if amount < 0:
            amount = len(self.raw) - self.position
        result = self.raw[self.position:self.position + amount]
        self.position += len(result)
        return result

    def read1(self, amount=-1):
        return self.read(amount)

    def close(self):
        pass


class RecordingTransport:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    @contextlib.contextmanager
    def request(self, method, url, *, headers=None, body=None):
        self.calls.append({
            "method": method,
            "url": url,
            "headers": dict(headers or {}),
            "body": body if isinstance(body, bytes) else None,
        })
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        yield response


class AnchoredCollection:
    """Cursor position remains anchored to an item when new saves are prepended."""

    def __init__(self, items):
        self.items = list(items)

    def collection_page(self, _collection, cursor):
        start = 0 if not cursor else self.items.index(int(cursor)) + 1
        page = self.items[start:start + 25]
        following = str(page[-1]) if page and start + len(page) < len(self.items) else ""
        return [instagram_media(pk) for pk in page], following


class URLAndTransportSecurityTests(unittest.TestCase):
    def test_cdn_url_parser_rejects_lookalikes_credentials_ports_and_unsafe_forms(self):
        unsafe = [
            "http://s.cdninstagram.com/media",
            "https://cdninstagram.com.evil.example/media",
            "https://evilcdninstagram.com/media",
            "https://s.cdninstagram.com@127.0.0.1/media",
            "https://s.cdninstagram.com:444/media",
            "https://s.cdninstagram.com./media",
            "https://s.cdninstagram.com/media#fragment",
            "https://s.cdninstagram.com\\@evil.example/media",
            "https://127.0.0.1/media",
            "https://[::1]/media",
            "https://s.cdninstagram.com/\r\nAuthorization",
        ]
        for url in unsafe:
            with self.subTest(url=url), self.assertRaises(bridge.BridgeError):
                bridge.validate_cdn_url(url)
        for url in [
            "https://s.cdninstagram.com/media",
            "https://video.xx.fbcdn.net/media",
        ]:
            self.assertEqual(bridge.validate_cdn_url(url), url)

    def test_dns_rejects_a_mixed_public_and_private_answer(self):
        records = [
            (2, 1, 6, "", ("8.8.8.8", 443)),
            (2, 1, 6, "", ("10.0.0.1", 443)),
        ]
        with patch.object(bridge.socket, "getaddrinfo", return_value=records):
            with self.assertRaises(bridge.BridgeError) as raised:
                bridge.resolve_public("s.cdninstagram.com")
        self.assertEqual(raised.exception.code, "private_network_refused")
        for address in [
            "127.0.0.1", "10.1.2.3", "169.254.169.254", "::1",
            "fe80::1", "::ffff:127.0.0.1", "224.0.0.1",
            "100.64.0.1", "2001:db8::1",
        ]:
            with self.subTest(address=address):
                self.assertFalse(bridge.public_ip(address))

    def test_connection_uses_pinned_ip_and_original_tls_hostname(self):
        connection = bridge.PinnedHTTPSConnection("s.cdninstagram.com", "8.8.8.8")
        raw_socket = Mock()
        tls_context = Mock()
        connection._context = tls_context
        with patch.object(bridge.socket, "create_connection", return_value=raw_socket) as connect:
            connection.connect()
        connect.assert_called_once_with(("8.8.8.8", 443), timeout=bridge.CONNECT_TIMEOUT)
        tls_context.wrap_socket.assert_called_once_with(
            raw_socket, server_hostname="s.cdninstagram.com",
        )

    def test_request_deadline_interrupts_the_socket_and_closes_the_connection(self):
        connection = Mock()
        timer = Mock()
        callbacks = []

        def create_timer(seconds, callback):
            self.assertEqual(seconds, bridge.TRANSFER_SECONDS)
            callbacks.append(callback)
            return timer

        def blocked_request(*_args, **_kwargs):
            callbacks[0]()
            raise OSError("socket interrupted")

        connection.request.side_effect = blocked_request
        with (
            patch.object(bridge, "resolve_public", return_value=["8.8.8.8"]),
            patch.object(bridge, "PinnedHTTPSConnection", return_value=connection),
            patch.object(bridge.threading, "Timer", side_effect=create_timer),
        ):
            with self.assertRaises(bridge.BridgeError) as raised:
                with bridge.HTTPTransport().request(
                    "GET", "https://s.cdninstagram.com/media",
                ):
                    self.fail("An expired transfer must not expose a response")
        self.assertEqual(raised.exception.code, "network_timeout")
        self.assertTrue(raised.exception.temporary)
        connection.sock.shutdown.assert_called_once_with(bridge.socket.SHUT_RDWR)
        timer.start.assert_called_once()
        timer.cancel.assert_called_once()
        connection.close.assert_called_once()

    def test_media_redirect_is_validated_before_another_request(self):
        transport = RecordingTransport(
            FakeResponse(302, headers={"Location": "https://127.0.0.1/private"}),
        )
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(bridge.BridgeError):
                bridge.download_asset(
                    transport,
                    {"url": "https://s.cdninstagram.com/media", "family": "image"},
                    Path(directory), 1000,
                )
        self.assertEqual(len(transport.calls), 1)
        self.assertNotIn("Authorization", transport.calls[0]["headers"])
        self.assertNotIn("Cookie", transport.calls[0]["headers"])

    def test_cms_redirect_does_not_forward_the_bearer(self):
        transport = RecordingTransport(
            FakeResponse(302, headers={"Location": "https://evil.example/collect"}),
        )
        client = bridge.CMSClient("https://cms.example", "cms-canary", transport=transport)
        with self.assertRaises(bridge.BridgeError):
            client.call({"action": "heartbeat"})
        self.assertEqual(len(transport.calls), 1)
        self.assertEqual(transport.calls[0]["url"], "https://cms.example/api/references/ingest")

    def test_storage_origin_change_is_rejected(self):
        client = bridge.CMSClient(
            "https://cms.example", "cms-canary", "https://storage.example",
            RecordingTransport(FakeResponse(data={
                "storageOrigin": "https://different.example", "pollSeconds": 300,
            })),
        )
        with self.assertRaises(bridge.BridgeError) as raised:
            client.heartbeat(synced=False)
        self.assertEqual(raised.exception.code, "storage_origin_changed")

    def test_signed_upload_is_scoped_to_host_path_and_matching_token(self):
        base = {
            "signedUrl": "https://storage.example/storage/v1/object/upload/sign/bucket/file?token=scoped",
            "path": "bucket/file",
            "token": "scoped",
        }
        invalid_targets = [
            {**base, "signedUrl": base["signedUrl"].replace("storage.example", "evil.example")},
            {**base, "token": "different"},
            {**base, "path": "bucket/../file"},
            {**base, "signedUrl": base["signedUrl"] + "&token=second"},
            {**base, "signedUrl": base["signedUrl"].replace(
                "/storage/v1/object/upload/sign/", "/rest/v1/",
            )},
        ]
        for target in invalid_targets:
            with self.subTest(target=target), self.assertRaises(bridge.BridgeError):
                bridge.validate_upload_target(target, "https://storage.example")

    def test_size_limit_uses_received_bytes_when_content_length_is_missing(self):
        transport = RecordingTransport(FakeResponse(
            headers={"Content-Type": "image/jpeg"}, raw=b"\xff\xd8\xff" + b"x" * 300,
        ))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(bridge.RejectedAsset):
                bridge.download_asset(
                    transport,
                    {"url": "https://s.cdninstagram.com/media", "family": "image"},
                    Path(directory), 100,
                )
            self.assertEqual(list(Path(directory).iterdir()), [])


class IntakeAcknowledgementTests(unittest.TestCase):
    def test_upload_never_receives_cms_credentials_and_complete_uses_its_batch(self):
        reference_id, batch_id = str(uuid.uuid4()), str(uuid.uuid4())
        content = b"\xff\xd8\xffjpeg"
        object_path = "bucket/user/reference/image.jpeg"
        target = {
            "index": 0, "path": object_path, "token": "scoped",
            "signedUrl": "https://storage.example/storage/v1/object/upload/sign/"
                         + object_path + "?token=scoped",
            "mimeType": "image/jpeg", "size": len(content),
        }
        transport = RecordingTransport(
            FakeResponse(data={
                "id": reference_id, "uploadBatchId": batch_id,
                "duplicate": False, "uploads": [target],
            }),
            FakeResponse(),
            FakeResponse(data={"id": reference_id, "completed": True}),
        )
        client = bridge.CMSClient(
            "https://cms.example", "cms-canary", "https://storage.example", transport,
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "asset"
            path.write_bytes(content)
            acknowledgement = client.import_reference(
                {"externalId": "10000"}, [bridge.Asset(path, "image/jpeg", len(content))],
            )
        self.assertEqual(acknowledgement.reference_id, reference_id)
        self.assertFalse(acknowledgement.skipped)
        self.assertEqual([call["method"] for call in transport.calls], ["POST", "PUT", "POST"])
        for call in transport.calls:
            if call["url"].startswith("https://cms.example/"):
                self.assertEqual(call["headers"]["Authorization"], "Bearer cms-canary")
            else:
                self.assertFalse(any(
                    name.lower() in ("authorization", "cookie", "apikey")
                    for name in call["headers"]
                ))
                self.assertNotIn("cms-canary", str(call))
        self.assertEqual(json.loads(transport.calls[-1]["body"])["uploadBatchId"], batch_id)

    def test_complete_cannot_acknowledge_another_reference(self):
        client = bridge.CMSClient(
            "https://cms.example", "token",
            transport=RecordingTransport(FakeResponse(data={
                "id": str(uuid.uuid4()), "ok": True,
            })),
        )
        with self.assertRaises(bridge.BridgeError) as raised:
            client.complete(str(uuid.uuid4()))
        self.assertEqual(raised.exception.code, "incomplete_cms_acknowledgement")

    def test_invalid_upload_index_is_rejected_before_upload(self):
        transport = RecordingTransport(FakeResponse(data={
            "id": str(uuid.uuid4()), "duplicate": False, "uploads": [{}],
        }))
        client = bridge.CMSClient(
            "https://cms.example", "token", "https://storage.example", transport,
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "asset"
            path.write_bytes(b"x")
            with self.assertRaises(bridge.BridgeError):
                client.import_reference(
                    {"externalId": "10000"}, [bridge.Asset(path, "image/jpeg", 1)],
                )
        self.assertEqual(len(transport.calls), 1)

    def test_manual_duplicate_uses_ack_without_accessing_complete(self):
        reference_id = str(uuid.uuid4())
        transport = RecordingTransport(FakeResponse(data={
            "id": reference_id, "duplicate": True, "uploads": [],
        }))
        client = bridge.CMSClient("https://cms.example", "token", transport=transport)
        acknowledgement = client.import_reference({"externalId": "10000"}, [])
        self.assertEqual(acknowledgement.reference_id, reference_id)
        self.assertEqual(len(transport.calls), 1)

    def test_lost_completion_response_recovers_without_creating_a_second_reference(self):
        reference_id = str(uuid.uuid4())
        transport = RecordingTransport(
            FakeResponse(data={"id": reference_id, "duplicate": False, "uploads": []}),
            bridge.BridgeError("network_unavailable", temporary=True),
            FakeResponse(data={"id": reference_id, "duplicate": True, "uploads": []}),
        )
        client = bridge.CMSClient("https://cms.example", "token", transport=transport)
        with tempfile.TemporaryDirectory() as directory:
            state = bridge.State(Path(directory) / "state.sqlite3", "identity")
            self.addCleanup(state.close)
            snapshot = bridge.media_snapshot(instagram_media(10000))
            state.enqueue([snapshot])
            with self.assertRaises(bridge.BridgeError):
                client.import_reference(snapshot["reference"], [])
            self.assertEqual(state.count_pending(), 1)
            acknowledgement = client.import_reference(snapshot["reference"], [])
            state.acknowledge(snapshot, acknowledgement)
            self.assertEqual(state.count_pending(), 0)
            self.assertEqual(state.db.execute("SELECT count(*) FROM seen").fetchone()[0], 1)


class RecoveryAndPaginationTests(unittest.TestCase):
    def open_state(self, directory):
        state = bridge.State(Path(directory) / "state.sqlite3", "identity")
        self.addCleanup(state.close)
        return state

    def test_page_failure_rolls_back_queue_and_cursor_together(self):
        with tempfile.TemporaryDirectory() as directory:
            state = self.open_state(directory)
            state.set("backfill_cursor", "old")
            valid = bridge.media_snapshot(instagram_media(10000))
            invalid = {"pk": "invalid", "reference": {}}
            with self.assertRaises(KeyError):
                state.commit_page([valid, invalid], "new")
            self.assertEqual(state.count_pending(), 0)
            self.assertEqual(state.get("backfill_cursor"), "old")

    def test_invalid_acknowledgement_does_not_remove_the_pending_item(self):
        with tempfile.TemporaryDirectory() as directory:
            state = self.open_state(directory)
            snapshot = bridge.media_snapshot(instagram_media(10000))
            state.enqueue([snapshot])
            with self.assertRaises(bridge.BridgeError):
                state.acknowledge(snapshot, bridge.IntakeAck("invalid"))
            self.assertEqual(state.count_pending(), 1)
            self.assertEqual(state.db.execute("SELECT count(*) FROM seen").fetchone()[0], 0)

    def test_tombstone_acknowledgement_prevents_automatic_reimport(self):
        transport = RecordingTransport(FakeResponse(data={
            "ok": True, "skipped": True, "id": None, "duplicate": True, "uploads": [],
        }))
        client = bridge.CMSClient("https://cms.example", "token", transport=transport)
        with tempfile.TemporaryDirectory() as directory:
            state = self.open_state(directory)
            snapshot = bridge.media_snapshot(instagram_media(10000))
            state.enqueue([snapshot])
            acknowledgement = client.import_reference(snapshot["reference"], [])
            state.acknowledge(snapshot, acknowledgement)
            state.enqueue([snapshot])
            self.assertEqual(state.count_pending(), 0)
        self.assertEqual(len(transport.calls), 1)

    def test_more_than_fifty_new_saves_reconcile_after_the_full_scan(self):
        source = AnchoredCollection(range(11000, 10000, -1))
        with tempfile.TemporaryDirectory() as directory:
            state = self.open_state(directory)
            for _ in range(7):
                bridge.discover(source, "1", "CarolOS", state)
            source.items = list(range(11075, 11000, -1)) + source.items
            for _ in range(90):
                bridge.discover(source, "1", "CarolOS", state)
            self.assertEqual(state.count_pending(), 1075)
            self.assertIsNotNone(state.get("last_full_scan"))

    def test_old_publication_date_does_not_hide_a_newly_discovered_save(self):
        snapshot = bridge.media_snapshot(instagram_media(10000))
        self.assertTrue(snapshot["reference"]["publishedAt"].startswith("2001"))
        with tempfile.TemporaryDirectory() as directory:
            state = self.open_state(directory)
            state.enqueue([snapshot])
            self.assertEqual(state.count_pending(), 1)
            first_seen = state.db.execute("SELECT first_seen_at FROM queue").fetchone()[0]
            self.assertNotEqual(first_seen, snapshot["reference"]["publishedAt"])

    def test_repeated_server_cursor_preserves_the_existing_checkpoint(self):
        source = Mock()
        source.collection_page.side_effect = [
            ([], ""),
            ([instagram_media(10000)], "stalled"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            state = self.open_state(directory)
            state.set("backfill_cursor", "stalled")
            with self.assertRaises(bridge.BridgeError) as raised:
                bridge.discover(source, "1", "CarolOS", state)
            self.assertEqual(raised.exception.code, "instagram_cursor_stalled")
            self.assertEqual(state.get("backfill_cursor"), "stalled")
            self.assertEqual(state.count_pending(), 0)

    def test_carousel_omission_is_recorded_for_the_analysis(self):
        snapshot = bridge.media_snapshot({
            "pk": "10000", "code": "Media10000", "media_type": 8,
            "resources": [
                {"media_type": 1, "thumbnail_url": f"https://s.cdninstagram.com/{index}"}
                for index in range(15)
            ],
        })
        self.assertEqual(snapshot["omitted_assets"], 5)
        self.assertEqual(len(snapshot["candidates"]), 10)


if __name__ == "__main__":
    unittest.main()
