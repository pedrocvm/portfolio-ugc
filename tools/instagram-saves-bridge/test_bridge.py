"""Offline contract, local credential and recovery tests. No Instagram login."""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import os
import stat
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import bridge
from bridge_core import (
    BridgeError, Config, IntakeAck, State, detect_mime, media_snapshot,
    normalized_origin, private_directory, process_lock, process_snapshot,
    read_private_json, validate_username, write_private_json,
)


REFERENCE_ID = "873befec-a0cb-487a-9035-965d6f32d214"
CMS_ORIGIN = "https://cms.example.com"
STORAGE_ORIGIN = "https://storage.example.com"


def saved_media(pk="1234567890123456789", **overrides):
    return {
        "pk": pk, "code": "DVxExample01", "media_type": 2,
        "caption_text": "Um roteiro que cabe na rotina\nExemplo em português.",
        "user": {"username": "criadora"},
        "taken_at": dt.datetime(2024, 1, 1, 10, 30, tzinfo=dt.timezone.utc),
        "video_url": "https://scontent.cdninstagram.com/video.mp4",
        "thumbnail_url": "https://scontent.cdninstagram.com/image.jpg",
        "resources": [], **overrides,
    }


def local_config(**overrides):
    return Config(
        cms_origin=CMS_ORIGIN, storage_origin=STORAGE_ORIGIN,
        username="carol", collection_name="CarolOS", account_id="123",
        collection_id="456", cms_token="import-token-local-only",
        accepted_at="2026-10-04T12:00:00+00:00", **overrides,
    )


class LocalTestCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        os.chmod(self.directory, 0o700)
        self.addCleanup(self.temporary.cleanup)


class PayloadTests(unittest.TestCase):
    def test_caption_publication_and_author_are_preserved_without_save_timestamp(self):
        snapshot = media_snapshot(saved_media())
        reference = snapshot["reference"]
        self.assertEqual(reference["externalId"], "1234567890123456789")
        self.assertEqual(reference["sourceUrl"], "https://www.instagram.com/p/DVxExample01/")
        self.assertEqual(reference["creatorHandle"], "criadora")
        self.assertEqual(reference["mediaKind"], "reel")
        self.assertEqual(reference["publishedAt"], "2024-01-01T10:30:00+00:00")
        self.assertEqual(reference["title"], "Um roteiro que cabe na rotina")
        self.assertNotIn("savedAt", reference)
        self.assertNotIn("video_url", reference)
        self.assertEqual([item["family"] for item in snapshot["candidates"]], ["video", "image"])

    def test_carousel_has_at_most_ten_files_and_reports_omission(self):
        resources = [{"media_type": 1, "thumbnail_url": f"https://a.fbcdn.net/{index}.jpg"} for index in range(15)]
        snapshot = media_snapshot(saved_media(media_type=8, resources=resources))
        self.assertEqual(snapshot["reference"]["mediaKind"], "carousel")
        self.assertEqual(len(snapshot["candidates"]), 10)
        self.assertEqual(snapshot["omitted_assets"], 5)

    def test_invalid_external_id_and_url_code_are_refused(self):
        for overrides in ({"pk": "12/345"}, {"code": "../../elsewhere"}, {"code": "x?token=secret"}):
            with self.subTest(overrides=overrides), self.assertRaises(BridgeError):
                media_snapshot(saved_media(**overrides))

    def test_terminal_controls_are_not_forwarded_and_payload_is_bounded(self):
        snapshot = media_snapshot(saved_media(caption_text="\x1b[31m" + "ç" * 40000))
        caption = snapshot["reference"]["caption"]
        self.assertNotIn("\x1b", caption)
        self.assertEqual(len(caption), 30000)
        self.assertLessEqual(len(snapshot["reference"]["title"]), 200)

    def test_magic_bytes_override_untrusted_claims(self):
        self.assertEqual(detect_mime(b"\xff\xd8\xff\xe0image", "application/octet-stream"), "image/jpeg")
        self.assertEqual(detect_mime(b"\x00\x00\x00\x18ftypisom", "video/mp4"), "video/mp4")
        with self.assertRaises(BridgeError):
            detect_mime(b"<html>Sign in</html>", "image/jpeg")
        with self.assertRaises(BridgeError):
            detect_mime(b"\xff\xd8\xff\xe0image", "video/mp4")

    def test_username_and_origin_validation(self):
        self.assertEqual(validate_username(" @Carol "), "carol")
        self.assertEqual(normalized_origin("https://CMS.example.com/"), CMS_ORIGIN)
        for origin in (None, "https://cms.example.com/path", "https://cms.example.com/?token=x", "http://cms.example.com"):
            with self.subTest(origin=origin), self.assertRaises(BridgeError):
                normalized_origin(origin)


class PrivateStateTests(LocalTestCase):
    def test_config_and_session_permissions(self):
        state_dir = private_directory(self.directory / "state")
        config = local_config()
        config.save(state_dir / "config.json")
        write_private_json(state_dir / "session.json", {"session": "local-secret"})
        self.assertEqual(stat.S_IMODE(state_dir.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((state_dir / "config.json").stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE((state_dir / "session.json").stat().st_mode), 0o600)
        self.assertEqual(Config.load(state_dir / "config.json"), config)

    def test_state_inside_any_git_repository_is_refused(self):
        repo = self.directory / "repo"
        repo.mkdir()
        (repo / ".git").mkdir()
        with self.assertRaisesRegex(BridgeError, "state_inside_repository"):
            private_directory(repo / "state")

    def test_symlink_and_publicly_readable_state_files_are_refused(self):
        target = self.directory / "secret.json"
        write_private_json(target, {"secret": "not-for-output"})
        link = self.directory / "link.json"
        link.symlink_to(target)
        with self.assertRaisesRegex(BridgeError, "unsafe_state_file"):
            read_private_json(link)
        target.chmod(0o644)
        with self.assertRaisesRegex(BridgeError, "unsafe_state_file"):
            read_private_json(target)

    def test_two_process_locks_cannot_overlap(self):
        with process_lock(self.directory):
            with self.assertRaisesRegex(BridgeError, "already_running"):
                with process_lock(self.directory):
                    self.fail("A second writer acquired the state lock")

    def test_poll_less_than_five_minutes_is_refused(self):
        config = local_config()
        config.poll_seconds = 299
        config.save(self.directory / "config.json")
        with self.assertRaisesRegex(BridgeError, "invalid_local_config"):
            Config.load(self.directory / "config.json")

    def test_state_identity_and_seen_survive_restarting(self):
        path = self.directory / "state.sqlite3"
        snapshot = media_snapshot(saved_media())
        state = State(path, "one-account-and-collection")
        state.enqueue([snapshot])
        state.acknowledge(snapshot, IntakeAck(REFERENCE_ID))
        state.close()
        state = State(path, "one-account-and-collection")
        try:
            self.assertEqual(state.enqueue([snapshot]), 0)
            self.assertEqual(state.count_pending(), 0)
        finally:
            state.close()
        with self.assertRaisesRegex(BridgeError, "state_identity_mismatch"):
            State(path, "another-account")

    def test_queue_failure_remains_visible_during_backoff(self):
        state = State(self.directory / "state.sqlite3", "identity")
        self.addCleanup(state.close)
        snapshot = media_snapshot(saved_media())
        state.enqueue([snapshot])
        state.defer(snapshot["pk"])
        state.defer(snapshot["pk"])
        self.assertEqual(state.pending(), [])
        self.assertTrue(state.has_failed_pending())
        self.assertEqual(state.count_pending(), 1)
        state.acknowledge(snapshot, IntakeAck(REFERENCE_ID))
        self.assertFalse(state.has_failed_pending())

    def test_missing_reel_media_is_explained_and_temporary_files_are_removed(self):
        snapshot = media_snapshot(saved_media(video_url=None, thumbnail_url=None))
        cms = Mock()
        cms.import_reference.return_value = IntakeAck(REFERENCE_ID)
        self.assertEqual(process_snapshot(snapshot, cms, self.directory), IntakeAck(REFERENCE_ID))
        reference, assets = cms.import_reference.call_args.args
        self.assertIn("não permitem transcrever", reference["notes"])
        self.assertEqual(assets, [])
        self.assertEqual(list(self.directory.glob("transfer-*")), [])


class FakeInstagram:
    def __init__(self):
        self.user_id = None
        self.username = ""
        self.password = ""
        self.events = []
        self.restored_settings = None
        self.login = Mock()
        self.account_info = Mock(return_value={"pk": "123", "username": "carol"})
        self.collections = Mock(return_value=[{"id": "456", "name": "CarolOS"}])
        self.collection_medias_v1_chunk = Mock(return_value=([saved_media()], "next-cursor"))
        self.get_settings = Mock(return_value={
            "uuids": {
                "phone_id": "phone-stable", "uuid": "uuid-stable",
                "client_session_id": "client-stable", "advertising_id": "ad-stable",
                "android_device_id": "android-stable", "request_id": "request-stable",
                "tray_session_id": "tray-stable",
            },
            "device_settings": {"manufacturer": "Google", "model": "Pixel Stable"},
            "user_agent": "Instagram stable test profile",
            "country": "PT", "country_code": 351, "locale": "pt_PT",
            "timezone_offset": 3600, "timezone_name": "Europe/Lisbon",
            "authorization_data": {"ds_user_id": "123"},
            "cookies": {"sessionid": "never-save-this-cookie"},
            "password": "never-save-this",
        })

    def set_settings(self, settings):
        self.events.append("restore")
        self.restored_settings = settings
        authorization = settings.get("authorization_data") or {}
        self.user_id = authorization.get("ds_user_id")


class CLITests(LocalTestCase):
    def setUp(self):
        super().setUp()
        self.output = io.StringIO()

    def test_setup_requires_explicit_local_acceptance_before_any_connection(self):
        with patch("bridge.require_terminal"), patch("bridge.prompt", return_value="NÃO"), patch("bridge.CMSClient") as cms:
            with contextlib.redirect_stdout(self.output), self.assertRaisesRegex(BridgeError, "consent_required"):
                bridge.setup(self.directory)
        cms.assert_not_called()
        self.assertFalse((self.directory / "config.json").exists())

    def test_setup_env_token_does_not_persist_or_print_token(self):
        responses = ["ACEITO", CMS_ORIGIN, "carol", "CarolOS"]
        cms = Mock()
        cms.heartbeat.return_value = {"storageOrigin": STORAGE_ORIGIN, "collectionName": "CarolOS", "pollSeconds": 300}
        with patch("bridge.require_terminal"), patch("bridge.prompt", side_effect=responses), patch("bridge.CMSClient", return_value=cms), patch.dict(os.environ, {"CAROLOS_REFERENCE_TOKEN": "top-secret-token"}), patch("bridge.getpass.getpass") as password:
            with contextlib.redirect_stdout(self.output):
                bridge.setup(self.directory)
        password.assert_not_called()
        config = Config.load(self.directory / "config.json")
        self.assertEqual(config.cms_token, "")
        self.assertEqual(config.storage_origin, STORAGE_ORIGIN)
        self.assertNotIn("top-secret-token", self.output.getvalue())
        self.assertNotIn("top-secret-token", (self.directory / "config.json").read_text())
        cms.heartbeat.assert_called_once_with(synced=False)

    def test_session_is_restored_before_reads_and_daemon_never_logs_in(self):
        config = local_config()
        fake = FakeInstagram()
        module = types.ModuleType("instagrapi")
        module.Client = Mock(return_value=fake)
        path = self.directory / "session.json"
        write_private_json(path, {"version": 1, "username": "carol", "account_id": "123", "settings": {"authorization_data": {"ds_user_id": "123"}}})
        with patch("bridge.importlib.metadata.version", return_value=bridge.INSTAGRAPI_VERSION), patch.dict(sys.modules, {"instagrapi": module}):
            adapter = bridge.InstagramClient(config, path)
            adapter.validate_binding()
            adapter.collection_page("456", "cursor")
            adapter.save()
        self.assertEqual(fake.events[0], "restore")
        self.assertEqual(fake.password, "")
        fake.login.assert_not_called()
        fake.collection_medias_v1_chunk.assert_called_once_with("456", max_id="cursor")
        saved = read_private_json(path)
        self.assertNotIn("password", saved["settings"])
        self.assertNotIn("never-save-this", path.read_text())
        with self.assertRaisesRegex(BridgeError, "instagram_action_required"):
            fake.challenge_resolve({"challenge": "do-not-solve"})

    def test_failed_login_attempts_reuse_one_private_device_profile(self):
        config = local_config()
        module = types.ModuleType("instagrapi")
        first = FakeInstagram()
        second = FakeInstagram()
        module.Client = Mock(side_effect=[first, second])
        session_path = self.directory / "session.json"
        device_path = self.directory / "device.json"

        with patch("bridge.importlib.metadata.version", return_value=bridge.INSTAGRAPI_VERSION), patch.dict(sys.modules, {"instagrapi": module}):
            bridge.InstagramClient(config, session_path)
            self.assertFalse(session_path.exists())
            self.assertTrue(device_path.exists())
            saved = read_private_json(device_path)
            self.assertEqual(saved["username"], "carol")
            self.assertEqual(saved["settings"]["uuids"]["android_device_id"], "android-stable")
            self.assertEqual(saved["settings"]["device_settings"]["model"], "Pixel Stable")
            self.assertNotIn("authorization_data", saved["settings"])
            self.assertNotIn("cookies", saved["settings"])
            self.assertNotIn("password", device_path.read_text())
            self.assertNotIn("never-save-this", device_path.read_text())
            self.assertEqual(stat.S_IMODE(device_path.stat().st_mode), 0o600)

            bridge.InstagramClient(config, session_path)

        self.assertEqual(second.events, ["restore"])
        self.assertEqual(second.restored_settings["uuids"]["uuid"], "uuid-stable")
        self.assertEqual(second.restored_settings["device_settings"]["manufacturer"], "Google")
        self.assertIsNone(second.user_id)
        first.login.assert_not_called()
        second.login.assert_not_called()

    def test_saved_session_cannot_bind_another_account(self):
        fake = FakeInstagram()
        module = types.ModuleType("instagrapi")
        module.Client = Mock(return_value=fake)
        path = self.directory / "session.json"
        write_private_json(path, {"username": "another-user", "account_id": "999", "settings": {}})
        with patch("bridge.importlib.metadata.version", return_value=bridge.INSTAGRAPI_VERSION), patch.dict(sys.modules, {"instagrapi": module}):
            with self.assertRaisesRegex(BridgeError, "instagram_account_mismatch"):
                bridge.InstagramClient(local_config(), path)
        fake.login.assert_not_called()

    def test_wrong_collection_id_stops_even_if_name_matches(self):
        fake = FakeInstagram()
        fake.user_id = "123"
        fake.collections.return_value = [{"id": "999", "name": "CarolOS"}]
        adapter = object.__new__(bridge.InstagramClient)
        adapter.client = fake
        adapter.config = local_config()
        with self.assertRaisesRegex(BridgeError, "instagram_collection_mismatch"):
            adapter.validate_binding()

    def test_challenge_errors_stop_without_retry_and_do_not_print_secrets(self):
        class ChallengeRequired(Exception):
            pass

        def fail():
            print("sensitive-third-party-output")
            raise ChallengeRequired("sessionid=do-not-disclose")

        errors = io.StringIO()
        with contextlib.redirect_stdout(self.output), contextlib.redirect_stderr(errors):
            with self.assertRaises(BridgeError) as caught:
                bridge.library_call(fail)
            bridge.show_error(caught.exception)
        self.assertEqual(caught.exception.code, "instagram_action_required")
        self.assertFalse(caught.exception.temporary)
        self.assertNotIn("sensitive", self.output.getvalue())
        self.assertNotIn("sessionid", errors.getvalue())

    def test_rate_limits_back_off_but_feedback_and_login_expiry_stop(self):
        for name in ("FeedbackRequired", "LoginRequired", "CaptchaRequired", "CheckpointRequired"):
            with self.subTest(name=name):
                error = type(name, (Exception,), {})("hidden-server-body")
                self.assertFalse(bridge.translate_instagram_error(error).temporary)
        throttled = type("ClientThrottledError", (Exception,), {})("hidden")
        self.assertTrue(bridge.translate_instagram_error(throttled).temporary)
        interrupted = type("ClientIncompleteReadError", (Exception,), {})("hidden")
        self.assertTrue(bridge.translate_instagram_error(interrupted).temporary)

    def test_heartbeat_keeps_pending_failure_visible_between_retry_cycles(self):
        config = local_config()
        config.save(self.directory / "config.json")
        state = State(self.directory / "state.sqlite3", f"{config.cms_origin}|{config.account_id}|{config.collection_id}")
        snapshot = media_snapshot(saved_media())
        state.enqueue([snapshot])
        state.defer(snapshot["pk"])
        state.defer(snapshot["pk"])
        state.close()
        cms = Mock()
        cms.heartbeat.return_value = {"storageOrigin": STORAGE_ORIGIN, "collectionName": "CarolOS"}
        with patch("bridge.CMSClient", return_value=cms), patch("bridge.InstagramClient"), patch("bridge.discover", return_value=0):
            with contextlib.redirect_stdout(self.output), contextlib.redirect_stderr(io.StringIO()):
                result = bridge.synchronize(self.directory, once=True)
        self.assertEqual(result, 1)
        self.assertEqual(cms.heartbeat.call_args.kwargs, {"synced": True, "error": bridge.MESSAGES["reference_pending_retry"]})
        self.assertEqual(cms.heartbeat.call_args_list[0].kwargs, {"synced": False, "error": bridge.MESSAGES["reference_pending_retry"]})

    def test_stale_transfer_cleanup_preserves_unrelated_state(self):
        abandoned = self.directory / "transfer-old"
        abandoned.mkdir()
        (abandoned / "media").write_bytes(b"private-media")
        safe = self.directory / "keep-this"
        safe.mkdir()
        bridge.cleanup_abandoned_transfers(self.directory)
        self.assertFalse(abandoned.exists())
        self.assertTrue(safe.exists())


if __name__ == "__main__":
    unittest.main()
