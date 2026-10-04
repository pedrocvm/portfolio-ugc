"""Offline process, restart and recovery tests for the persistent server bridge."""

from __future__ import annotations

import contextlib
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bridge
import bridge_service as service
from bridge_core import BridgeError, Config, State, private_directory, process_lock, read_private_json, write_private_json


HERE = Path(__file__).resolve().parent
CMS_ORIGIN = "https://cms.example"
STORAGE_ORIGIN = "https://storage.example"


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = private_directory(Path(self.temporary.name) / "state")
        self.output = io.StringIO()
        self.errors = io.StringIO()

    def tearDown(self):
        self.temporary.cleanup()

    def configure(self):
        config = Config(
            cms_origin=CMS_ORIGIN, storage_origin=STORAGE_ORIGIN,
            username="carol", collection_name="CarolOS", account_id="123",
            collection_id="456", cms_token="cms-canary-secret", accepted_at="2026-10-04T12:00:00Z",
        )
        config.save(self.directory / "config.json")
        return config

    def invoke(self, *arguments):
        with contextlib.redirect_stdout(self.output), contextlib.redirect_stderr(self.errors):
            return bridge.main(["--state-dir", str(self.directory), *arguments])

    def block(self, code="instagram_action_required"):
        with process_lock(self.directory):
            service.block_service(self.directory, BridgeError(code))

    def test_permanent_failure_is_recorded_before_remote_failure_notification(self):
        self.configure()
        adapter = Mock()
        adapter.validate_binding.side_effect = BridgeError("instagram_action_required")
        cms = Mock()
        cms.heartbeat.return_value = {"collectionName": "CarolOS"}

        def verify_recorded(_cms, _error):
            self.assertEqual(service.read_block(self.directory)["code"], "instagram_action_required")

        with (
            patch.object(bridge, "InstagramClient", return_value=adapter) as clients,
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "send_failure", side_effect=verify_recorded),
        ):
            self.assertEqual(self.invoke("once"), 1)
            self.assertEqual(self.invoke("once"), 1)
            self.assertEqual(self.invoke("run"), 1)
        clients.assert_called_once()
        adapter.client.login.assert_not_called()
        self.assertEqual((self.directory / service.BLOCK_FILE).stat().st_mode & 0o777, 0o600)

    def test_block_survives_restart_and_releases_worker_lock_for_manual_recovery(self):
        self.configure()
        self.block()
        pauses = []

        def at_pause(seconds):
            self.assertEqual(seconds, service.IDLE_SECONDS)
            with process_lock(self.directory):
                pauses.append("manual operation can acquire worker lock")
            with self.assertRaisesRegex(BridgeError, "already_running"):
                with service.daemon_lock(self.directory):
                    self.fail("A second daemon must not acquire the daemon lock")
            self.assertEqual(service.local_status(self.directory)["phase"], "blocked")
            raise service.ServiceStopped()

        with (
            patch.object(bridge, "wait_interruptibly", side_effect=at_pause),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
            patch.object(bridge, "cleanup_abandoned_transfers") as cleanup,
        ):
            self.assertEqual(self.invoke("serve"), 0)
            self.assertEqual(self.invoke("serve"), 0)
        self.assertEqual(len(pauses), 2)
        cms.assert_not_called()
        instagram.assert_not_called()
        cleanup.assert_not_called()
        self.assertEqual(service.read_block(self.directory)["code"], "instagram_action_required")

    def test_service_without_setup_waits_without_instagram_or_cms_requests(self):
        with (
            patch.object(bridge, "wait_interruptibly", side_effect=service.ServiceStopped),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
        ):
            self.assertEqual(self.invoke("serve"), 0)
        cms.assert_not_called()
        instagram.assert_not_called()
        self.assertEqual(service.read_block(self.directory)["code"], "setup_required")
        self.assertFalse((self.directory / "state.sqlite3").exists())

    def test_service_without_bound_login_waits_without_network(self):
        config = self.configure()
        config.account_id = config.collection_id = ""
        config.save(self.directory / "config.json")
        with (
            patch.object(bridge, "wait_interruptibly", side_effect=service.ServiceStopped),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
        ):
            self.assertEqual(self.invoke("serve"), 0)
        self.assertEqual(service.read_block(self.directory)["code"], "login_required")
        cms.assert_not_called()
        instagram.assert_not_called()

    def test_occupied_worker_prevents_download_cleanup_and_all_network_activity(self):
        self.configure()
        with (
            process_lock(self.directory),
            patch.object(bridge, "wait_interruptibly", side_effect=service.ServiceStopped),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
            patch.object(bridge, "cleanup_abandoned_transfers") as cleanup,
        ):
            self.assertEqual(self.invoke("serve"), 0)
        self.assertIsNone(service.read_block(self.directory))
        cms.assert_not_called()
        instagram.assert_not_called()
        cleanup.assert_not_called()

    def test_a_second_daemon_cannot_enter_even_when_first_daemon_is_blocked(self):
        self.block()
        with service.daemon_lock(self.directory), patch.object(bridge, "synchronize") as sync:
            self.assertEqual(self.invoke("serve"), 1)
        sync.assert_not_called()
        self.assertEqual(service.read_block(self.directory)["code"], "instagram_action_required")

    def test_resume_requires_interactive_explicit_confirmation_before_any_network(self):
        self.configure()
        self.block()
        with (
            patch.object(bridge, "require_terminal", side_effect=BridgeError("interactive_required")),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
        ):
            self.assertEqual(self.invoke("resume"), 1)
        cms.assert_not_called()
        instagram.assert_not_called()
        with (
            patch.object(bridge, "require_terminal"),
            patch.object(bridge, "prompt", return_value="NÃO"),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
        ):
            self.assertEqual(self.invoke("resume"), 1)
        cms.assert_not_called()
        instagram.assert_not_called()
        self.assertEqual(service.read_block(self.directory)["code"], "instagram_action_required")

    def test_explicit_resume_validates_existing_session_and_cms_without_login(self):
        self.configure()
        self.block()
        events = []
        cms = Mock()
        cms.heartbeat.side_effect = lambda **_kwargs: events.append("cms") or {"collectionName": "CarolOS"}
        adapter = Mock()
        adapter.validate_binding.side_effect = lambda: events.append("instagram")
        adapter.save.side_effect = lambda: events.append("saved")
        with (
            patch.object(bridge, "require_terminal"),
            patch.object(bridge, "prompt", return_value="RETOMAR"),
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient", return_value=adapter),
        ):
            self.assertEqual(self.invoke("resume"), 0)
        self.assertEqual(events, ["cms", "instagram", "saved"])
        adapter.client.login.assert_not_called()
        self.assertIsNone(service.read_block(self.directory))

    def test_failed_manual_resume_cannot_convert_instagram_challenge_to_automatic_cms_pause(self):
        self.configure()
        self.block()
        cms = Mock()
        cms.heartbeat.side_effect = BridgeError("cms_connection_refused")
        with (
            patch.object(bridge, "require_terminal"),
            patch.object(bridge, "prompt", return_value="RETOMAR"),
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient") as instagram,
        ):
            self.assertEqual(self.invoke("resume"), 1)
        instagram.assert_not_called()
        blocked = service.read_block(self.directory)
        self.assertEqual(blocked["code"], "cms_connection_refused")
        self.assertTrue(blocked["manual_required"])
        with patch.object(bridge, "CMSClient") as cms:
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, {"next_attempt": 0}))
        cms.assert_not_called()

    def test_login_renew_clears_block_only_after_saved_session_and_cms_validation(self):
        self.configure()
        self.block()
        events = []
        adapter = Mock()
        adapter.account.return_value = ("123", "carol")
        adapter.client.collections.return_value = [{"id": "456", "name": "CarolOS"}]
        adapter.save.side_effect = lambda: events.append("session saved")
        cms = Mock()

        def heartbeat(**_kwargs):
            self.assertEqual(events, ["session saved"])
            self.assertIsNotNone(service.read_block(self.directory))
            return {"collectionName": "CarolOS"}

        cms.heartbeat.side_effect = heartbeat
        with (
            patch.object(bridge, "require_terminal"),
            patch.object(bridge.getpass, "getpass", return_value="password-canary"),
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient", return_value=adapter),
            patch.dict(os.environ, {"CAROLOS_BRIDGE_LOCATION": "server"}),
        ):
            self.assertEqual(self.invoke("login", "--renew"), 0)
        adapter.client.login.assert_called_once_with("carol", "password-canary", relogin=True, verification_code="")
        self.assertIsNone(service.read_block(self.directory))
        self.assertEqual(adapter.client.password, "")
        self.assertNotIn("password-canary", self.output.getvalue() + self.errors.getvalue())

    def test_login_with_rejected_cms_token_does_not_clear_existing_manual_block(self):
        self.configure()
        self.block()
        adapter = Mock()
        adapter.account.return_value = ("123", "carol")
        adapter.client.collections.return_value = [{"id": "456", "name": "CarolOS"}]
        cms = Mock()
        cms.heartbeat.side_effect = BridgeError("cms_connection_refused")
        with (
            patch.object(bridge, "require_terminal"),
            patch.object(bridge.getpass, "getpass", return_value="password-canary"),
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient", return_value=adapter),
        ):
            self.assertEqual(self.invoke("login", "--renew"), 1)
        self.assertTrue(service.read_block(self.directory)["manual_required"])

    def test_cms_only_pause_waits_full_interval_and_reauthorizes_without_instagram(self):
        self.configure()
        self.block("cms_connection_refused")
        blocked = service.read_block(self.directory)
        probe = {}
        cms = Mock()
        cms.heartbeat.return_value = {"collectionName": "CarolOS"}
        with (
            process_lock(self.directory),
            patch.object(bridge.time, "monotonic", return_value=0) as clock,
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient") as instagram,
            contextlib.redirect_stdout(self.output),
        ):
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, probe))
            clock.return_value = 299
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, probe))
            cms.heartbeat.assert_not_called()
            clock.return_value = 300
            self.assertTrue(bridge.recheck_cms_pause(self.directory, blocked, probe))
        cms.heartbeat.assert_called_once_with(synced=False)
        instagram.assert_not_called()
        self.assertIsNone(service.read_block(self.directory))

    def test_cms_pause_retries_with_backoff_without_touching_instagram(self):
        self.configure()
        self.block("cms_connection_refused")
        blocked = service.read_block(self.directory)
        probe = {}
        cms = Mock()
        cms.heartbeat.side_effect = [
            BridgeError("cms_connection_refused"),
            BridgeError("network_unavailable", temporary=True),
        ]
        with (
            process_lock(self.directory),
            patch.object(bridge.time, "monotonic", return_value=0) as clock,
            patch.object(bridge.random, "uniform", return_value=0),
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient") as instagram,
            contextlib.redirect_stderr(self.errors),
        ):
            bridge.recheck_cms_pause(self.directory, blocked, probe)
            clock.return_value = 300
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, probe))
            self.assertEqual(probe["next_attempt"], 600)
            clock.return_value = 600
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, probe))
            self.assertEqual(probe["next_attempt"], 1200)
            clock.return_value = 1199
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, probe))
        self.assertEqual(cms.heartbeat.call_count, 2)
        instagram.assert_not_called()
        self.assertFalse(service.read_block(self.directory)["manual_required"])

    def test_collection_change_while_cms_paused_requires_manual_recovery(self):
        self.configure()
        self.block("cms_connection_refused")
        blocked = service.read_block(self.directory)
        cms = Mock()
        cms.heartbeat.return_value = {"collectionName": "A different collection"}
        probe = {}
        with (
            process_lock(self.directory),
            patch.object(bridge.time, "monotonic", return_value=0) as clock,
            patch.object(bridge, "CMSClient", return_value=cms),
            patch.object(bridge, "InstagramClient") as instagram,
            contextlib.redirect_stderr(self.errors),
        ):
            bridge.recheck_cms_pause(self.directory, blocked, probe)
            clock.return_value = 300
            self.assertFalse(bridge.recheck_cms_pause(self.directory, blocked, probe))
        instagram.assert_not_called()
        self.assertEqual(service.read_block(self.directory)["code"], "instagram_collection_mismatch")
        self.assertTrue(service.read_block(self.directory)["manual_required"])

    def test_status_is_local_sanitized_and_docker_healthcheck_uses_zero_or_one(self):
        self.configure()
        service.write_status(self.directory, "waiting")
        with (
            service.daemon_lock(self.directory),
            patch.object(bridge, "CMSClient") as cms,
            patch.object(bridge, "InstagramClient") as instagram,
        ):
            self.assertEqual(self.invoke("status", "--healthcheck"), 0)
            self.assertEqual(self.output.getvalue(), "")
            self.assertEqual(self.invoke("status", "--json"), 0)
            details = json.loads(self.output.getvalue())
            self.assertTrue(details["daemon_active"])
            self.assertEqual(details["phase"], "waiting")
        self.block()
        self.output.truncate(0)
        self.output.seek(0)
        self.assertEqual(self.invoke("status", "--healthcheck"), 1)
        self.assertEqual(self.output.getvalue(), "")
        self.assertEqual(self.invoke("status"), 2)
        cms.assert_not_called()
        instagram.assert_not_called()
        self.assertNotIn("cms-canary-secret", self.output.getvalue() + self.errors.getvalue())
        self.assertNotIn(CMS_ORIGIN, self.output.getvalue())
        self.assertNotIn("carol\"", json.dumps(details))

    def test_server_setup_explicitly_accepts_session_storage_on_server_before_network(self):
        with (
            patch.dict(os.environ, {"CAROLOS_BRIDGE_LOCATION": "server"}),
            patch.object(bridge, "require_terminal"),
            patch.object(bridge, "prompt", return_value="NÃO") as prompt,
            patch.object(bridge, "CMSClient") as cms,
        ):
            self.assertEqual(self.invoke("setup"), 1)
        self.assertIn("guardar a sessão neste servidor", prompt.call_args.args[0])
        self.assertIn("volume privado deste servidor", self.output.getvalue())
        self.assertNotIn("senha e a sessão", self.output.getvalue())
        self.assertFalse((self.directory / "config.json").exists())
        cms.assert_not_called()

    def test_sigterm_shuts_down_waiting_service_and_preserves_block_across_real_restart(self):
        for _attempt in range(2):
            process = subprocess.Popen(
                [sys.executable, "-u", str(HERE / "bridge.py"), "--state-dir", str(self.directory), "serve"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            try:
                self.wait_for(lambda: service.local_status(self.directory)["daemon_active"] and (self.directory / service.BLOCK_FILE).exists(), process)
                process.send_signal(signal.SIGTERM)
                stdout, stderr = process.communicate(timeout=5)
                self.assertEqual(process.returncode, 0, stdout + stderr)
                self.assertFalse(service.local_status(self.directory)["daemon_active"])
                self.assertEqual(service.read_block(self.directory)["code"], "setup_required")
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=5)

    def test_sigterm_during_transfer_closes_queue_and_removes_partial_media_without_ack(self):
        config = self.configure()
        identity = f"{config.cms_origin}|{config.account_id}|{config.collection_id}"
        state = State(self.directory / "state.sqlite3", identity)
        state.enqueue([{"pk": "123", "reference": {"sourceUrl": "https://www.instagram.com/p/Example123/"}, "candidates": []}])
        state.close()
        program = """
import sys, tempfile, time
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, sys.argv[1])
import bridge
state_dir = Path(sys.argv[2])
cms = Mock()
cms.heartbeat.return_value = {"collectionName": "CarolOS"}
def interrupted_transfer(*args):
    with tempfile.TemporaryDirectory(prefix="transfer-", dir=state_dir) as directory:
        Path(directory, "partial-media").write_bytes(b"pending")
        Path(state_dir, "transfer-started").touch(mode=0o600)
        while True:
            time.sleep(30)
with patch.object(bridge, "CMSClient", return_value=cms), patch.object(bridge, "InstagramClient"), patch.object(bridge, "discover", return_value=0), patch.object(bridge, "process_snapshot", side_effect=interrupted_transfer):
    sys.exit(bridge.main(["--state-dir", str(state_dir), "serve"]))
"""
        process = subprocess.Popen(
            [sys.executable, "-u", "-c", program, str(HERE), str(self.directory)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            self.wait_for(lambda: (self.directory / "transfer-started").exists(), process)
            process.send_signal(signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=5)
            self.assertEqual(process.returncode, 0, stdout + stderr)
            self.assertEqual(list(self.directory.glob("transfer-*/partial-media")), [])
            reopened = State(self.directory / "state.sqlite3", identity)
            self.assertEqual(reopened.count_pending(), 1)
            reopened.close()
            self.assertIsNone(service.read_block(self.directory))
            with process_lock(self.directory):
                pass
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)

    def test_block_write_restores_the_existing_signal_mask_including_on_failure(self):
        original = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGUSR1})
        try:
            expected = signal.pthread_sigmask(signal.SIG_BLOCK, set())
            with service._durable_block_write():
                during = signal.pthread_sigmask(signal.SIG_BLOCK, set())
                self.assertIn(signal.SIGUSR1, during)
                self.assertIn(signal.SIGTERM, during)
            self.assertEqual(signal.pthread_sigmask(signal.SIG_BLOCK, set()), expected)
            with self.assertRaisesRegex(OSError, "test write failure"):
                with service._durable_block_write():
                    raise OSError("test write failure")
            self.assertEqual(signal.pthread_sigmask(signal.SIG_BLOCK, set()), expected)
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, original)

    def test_sigterm_during_block_fsync_persists_block_before_stop_and_prevents_calls_after_restart(self):
        config = self.configure()
        program = """
import os, signal, stat, sys, threading, time
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, sys.argv[1])
import bridge
import bridge_service as service
from bridge_core import BridgeError
state_dir = Path(sys.argv[2])
target = sys.argv[3]
with_thread = sys.argv[4] == "thread"
original_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGUSR1})
expected_mask = signal.pthread_sigmask(signal.SIG_BLOCK, set())
if with_thread:
    # This preexisting thread remains unmasked for SIGTERM. A process-directed
    # signal can therefore schedule Python's handler even while the main thread
    # blocks that signal inside the durable write.
    threading.Thread(target=threading.Event().wait, daemon=True).start()
inside_block = False
injected = False
real_fsync = os.fsync
real_block = bridge.block_service
def observed_block(*args):
    global inside_block
    inside_block = True
    try:
        return real_block(*args)
    finally:
        inside_block = False
def observed_fsync(descriptor):
    global injected
    kind = "directory" if stat.S_ISDIR(os.fstat(descriptor).st_mode) else "file"
    if inside_block and kind == target and not injected:
        injected = True
        Path(state_dir, "write-checkpoint").touch(mode=0o600)
        deadline = time.monotonic() + 5
        while not Path(state_dir, "write-release").exists():
            if time.monotonic() > deadline:
                raise RuntimeError("test release timeout")
            time.sleep(0.01)
    real_fsync(descriptor)
    if inside_block and kind == "directory":
        Path(state_dir, "directory-synced").touch(mode=0o600)
cms = Mock()
cms.heartbeat.return_value = {"collectionName": "CarolOS"}
adapter = Mock()
adapter.validate_binding.side_effect = BridgeError("instagram_action_required")
def instagram_client(*args):
    with Path(state_dir, "instagram-calls").open("a") as stream:
        stream.write("call\\n")
    return adapter
with patch.object(bridge, "CMSClient", return_value=cms), patch.object(bridge, "InstagramClient", side_effect=instagram_client), patch.object(bridge, "block_service", side_effect=observed_block), patch.object(os, "fsync", side_effect=observed_fsync):
    result = bridge.main(["--state-dir", str(state_dir), "serve"])
if signal.pthread_sigmask(signal.SIG_BLOCK, set()) != expected_mask:
    raise AssertionError("termination did not restore the prior signal mask")
signal.pthread_sigmask(signal.SIG_SETMASK, original_mask)
sys.exit(result)
"""
        for target in ("file", "directory"):
            for threading_mode in ("single", "thread"):
                with self.subTest(fsync_target=target, threading=threading_mode):
                    directory = private_directory(Path(self.temporary.name) / f"{target}-{threading_mode}")
                    config.save(directory / "config.json")
                    command = [sys.executable, "-u", "-c", program, str(HERE), str(directory), target, threading_mode]
                    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    try:
                        self.wait_for(lambda: (directory / "write-checkpoint").exists(), process)
                        process.send_signal(signal.SIGTERM)
                        # Allow the handler to run on the main thread if the
                        # kernel delivered the signal to the helper thread.
                        time.sleep(0.05)
                        self.assertIsNone(process.poll(), "SIGTERM interrupted the critical write")
                        (directory / "write-release").touch(mode=0o600)
                        stdout, stderr = process.communicate(timeout=5)
                        self.assertEqual(process.returncode, 0, stdout + stderr)
                        self.assertTrue((directory / "directory-synced").exists())
                        self.assertEqual(service.read_block(directory)["code"], "instagram_action_required")
                        self.assertTrue(service.read_block(directory)["manual_required"])
                        self.assertEqual((directory / "instagram-calls").read_text(), "call\n")
                    finally:
                        if process.poll() is None:
                            process.kill()
                            process.communicate(timeout=5)

                    restarted = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    try:
                        self.wait_for(
                            lambda: service.local_status(directory)["daemon_active"]
                            and read_private_json(directory / service.STATUS_FILE).get("phase") == "blocked",
                            restarted,
                        )
                        restarted.send_signal(signal.SIGTERM)
                        stdout, stderr = restarted.communicate(timeout=5)
                        self.assertEqual(restarted.returncode, 0, stdout + stderr)
                        self.assertEqual((directory / "instagram-calls").read_text(), "call\n")
                        self.assertEqual(service.read_block(directory)["code"], "instagram_action_required")
                    finally:
                        if restarted.poll() is None:
                            restarted.kill()
                            restarted.communicate(timeout=5)

    def wait_for(self, predicate, process):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if predicate():
                return
            if process.poll() is not None:
                stdout, stderr = process.communicate(timeout=5)
                self.fail("Child process stopped before the checkpoint\n" + stdout + stderr)
            time.sleep(0.02)
        self.fail("Child process did not reach the checkpoint")


if __name__ == "__main__":
    unittest.main()
