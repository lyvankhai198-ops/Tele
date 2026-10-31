#!/usr/bin/env python3
"""Offline integration tests. All VPS paths and commands are isolated fixtures."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]


class ReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="telecampaign-release-test-")
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / "app"
        self.remote = self.base / "origin.git"
        self.releases = self.base / "releases"
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.root.mkdir()
        self.log = self.base / "commands.log"
        self.mode = self.base / "failure-mode"
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}",
                    "TEST_ROOT": str(self.root), "TEST_LOG": str(self.log),
                    "TEST_MODE": str(self.mode), "GIT_CONFIG_NOSYSTEM": "1",
                    "GIT_CONFIG_GLOBAL": os.devnull}
        for name in ("deploy-telecampaign.sh", "rollback-telecampaign.sh",
                     "checkpoint-telecampaign.sh", "lib/telecampaign-release.sh"):
            target = self.root / "scripts" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            text = (SCRIPTS / name).read_text()
            text = text.replace('ENV_FILE="/etc/telecampaign/api.env"',
                                f'ENV_FILE="{self.base}/api.env"')
            if name.startswith("lib/"):
                text = text.replace('ROOT="/opt/telecampaign"', f'ROOT="{self.root}"')
                text = text.replace('RELEASES="/var/backups/telecampaign/releases"',
                                    f'RELEASES="{self.releases}"')
                text = text.replace('LOCK="/var/lib/telecampaign/operation.lock"',
                                    f'LOCK="{self.base}/operation.lock"')
            target.write_text(text)
        self.write("scripts/backup-telecampaign.sh", """#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/telecampaign-release.sh"
release_lock
echo backup >> "$TEST_LOG"
[[ "$(cat "$TEST_MODE")" != backup ]]
""")
        self.write("scripts/telecampaign-healthcheck.sh", """#!/usr/bin/env bash
echo health >> "$TEST_LOG"
[[ "$(cat "$TEST_MODE")" != health || "$(cat "$TEST_ROOT/artifacts/api-server/dist/index.mjs")" == old ]]
""")
        self.write("scripts/prepare-notification-media-storage.sh", """#!/usr/bin/env bash
echo preflight >> "$TEST_LOG"
[[ "$(cat "$TEST_MODE")" != preflight ]]
""")
        self.executable("pm2", """#!/usr/bin/env bash
set -e
[[ "$2" == telecampaign-api ]] || exit 99
echo "pm2 $*" >> "$TEST_LOG"
echo "pm2_node_options=${NODE_OPTIONS:-}" >> "$TEST_LOG"
case "$1" in
 stop) echo stopped > "$TEST_ROOT/process-state";;
 restart)
   if [[ "$(cat "$TEST_MODE")" == restart && "$(cat "$TEST_ROOT/artifacts/api-server/dist/index.mjs")" == new ]]; then exit 1; fi
   echo online > "$TEST_ROOT/process-state";;
 *) exit 99;;
esac
""")
        self.executable("pnpm", """#!/usr/bin/env bash
set -e
echo "pnpm $*" >> "$TEST_LOG"
echo "build_node_options=${NODE_OPTIONS:-}" >> "$TEST_LOG"
mode="$(cat "$TEST_MODE")"
if [[ "$*" == *install* ]]; then
  echo new > "$TEST_ROOT/node_modules/native.node"
  [[ "$mode" != install ]] || exit 1
elif [[ "$*" == *'@workspace/telecampaign'* ]]; then
  mkdir -p "$TEST_ROOT/artifacts/telecampaign/dist/public"
  echo new > "$TEST_ROOT/artifacts/telecampaign/dist/public/index.html"
  echo added > "$TEST_ROOT/artifacts/telecampaign/dist/new-only.js"
  [[ "$mode" != web ]] || exit 1
else
  echo new > "$TEST_ROOT/artifacts/api-server/dist/index.mjs"
  [[ "$mode" != api ]] || exit 1
fi
""")
        self.write(".gitignore", "node_modules/\ndist/\nprocess-state\n")
        for directory in ("artifacts/api-server", "artifacts/telecampaign", "lib/db"):
            self.write(f"{directory}/package.json", '{"name":"fixture"}\n')
        self.write("artifacts/api-server/src/lib/notificationMediaStorage.ts", "// supported\n")
        self.write("lib/db/src/schema/test.ts", "// unchanged schema\n")
        self.write("version.txt", "old\n")
        self.write("artifacts/api-server/dist/index.mjs", "old\n")
        self.write("artifacts/telecampaign/dist/public/index.html", "old\n")
        (self.root / "artifacts/telecampaign/dist/public/index.html").chmod(0o644)
        (self.root / "artifacts/telecampaign/dist/public").chmod(0o755)
        self.write("node_modules/native.node", "old native dependency\n")
        self.write("lib/db/dist/index.js", "old library\n")
        self.write("artifacts/api-server/node_modules/external/value", "old external\n")
        os.symlink("external", self.root / "artifacts/api-server/node_modules/link")
        self.write("process-state", "online\n")
        self.mode.write_text("none")
        (self.base / "api.env").write_text("NODE_ENV=production\n")
        (self.base / "external-media").write_text("new user upload, never roll back")
        (self.base / "external-database").write_text("new user order, never roll back")
        self.cmd(["git", "init", "--initial-branch=main", str(self.root)])
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Release test")
        self.git("add", ".")
        self.git("commit", "-qm", "baseline")
        self.old = self.git("rev-parse", "HEAD").stdout.strip()
        self.cmd(["git", "clone", "--bare", str(self.root), str(self.remote)])
        self.git("remote", "add", "origin", str(self.remote))
        self.write("version.txt", "new\n")
        self.git("add", ".")
        self.git("commit", "-qm", "next release")
        self.new = self.git("rev-parse", "HEAD").stdout.strip()
        self.git("push", "origin", "main")
        self.git("reset", "--hard", self.old)

    def cmd(self, args, check=True):
        return subprocess.run(args, env=self.env, text=True, capture_output=True,
                              check=check, timeout=20)

    def git(self, *args):
        return self.cmd(["git", "-C", str(self.root), *args])

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def executable(self, name, text):
        target = self.bin / name
        target.write_text(text)
        target.chmod(0o755)

    def script(self, name, *args):
        return self.cmd(["bash", str(self.root / "scripts" / name), *args], check=False)

    def assert_old_restored(self):
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.old)
        self.assertEqual((self.root / "node_modules/native.node").read_text(),
                         "old native dependency\n")
        self.assertEqual((self.root / "artifacts/api-server/dist/index.mjs").read_text(), "old\n")
        self.assertEqual((self.root / "artifacts/telecampaign/dist/public/index.html").read_text(), "old\n")
        self.assertEqual((self.root / "process-state").read_text(), "online\n")
        self.assertTrue((self.root / "artifacts/api-server/node_modules/link").is_symlink())
        self.assertFalse((self.root / "artifacts/telecampaign/dist/new-only.js").exists())
        self.assertEqual((self.root / "artifacts/telecampaign/dist/public/index.html").stat().st_mode & 0o777, 0o644)
        self.assertEqual((self.root / "artifacts/telecampaign/dist/public").stat().st_mode & 0o777, 0o755)
        self.assertEqual(self.git("status", "--porcelain").stdout, "")
        self.assertEqual((self.base / "external-media").read_text(), "new user upload, never roll back")
        self.assertEqual((self.base / "external-database").read_text(), "new user order, never roll back")

    def test_successful_deploy_preserves_previous_release(self):
        result = self.script("deploy-telecampaign.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.new)
        self.assertEqual((self.root / "artifacts/telecampaign/dist/public/index.html").stat().st_mode & 0o777, 0o644)
        snapshot = Path((self.releases / "PREVIOUS").read_text().strip())
        self.assertEqual((snapshot / "COMMIT").read_text().strip(), self.old)
        self.assertTrue((snapshot / "COMPLETE").exists())
        self.assertEqual(len(self.git("for-each-ref", "--format=%(refname)",
                                     "refs/telecampaign/checkpoints/").stdout.splitlines()), 1)

    def test_install_and_build_and_health_failures_auto_recover(self):
        for mode in ("install", "web", "api", "preflight", "restart", "health"):
            with self.subTest(mode=mode):
                self.mode.write_text(mode)
                self.log.write_text("")
                result = self.script("deploy-telecampaign.sh")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("restoring the previous", result.stderr)
                self.assert_old_restored()
                # Recovery itself must not install dependencies or rebuild.
                commands = self.log.read_text()
                self.assertEqual(commands.count(" install --frozen-lockfile"), 1)
                self.assertNotIn("pm2 restart all", commands)

    def test_manual_rollback_works_after_late_functional_failure(self):
        result = self.script("deploy-telecampaign.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.mode.write_text("health")
        self.log.write_text("")
        # A network/package outage cannot affect snapshot-based rollback.
        (self.bin / "pnpm").unlink()
        self.executable("pnpm", "#!/bin/sh\nexit 99\n")
        result = self.script("rollback-telecampaign.sh", "--previous")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_old_restored()
        self.assertNotIn("pnpm", self.log.read_text())

    def test_backup_failure_does_not_replace_live_release(self):
        self.mode.write_text("backup")
        result = self.script("deploy-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assert_old_restored()
        self.assertFalse((self.releases / "PREVIOUS").exists())

    def test_corrupt_snapshot_is_rejected_before_stopping(self):
        self.assertEqual(self.script("deploy-telecampaign.sh").returncode, 0)
        snapshot = Path((self.releases / "PREVIOUS").read_text().strip())
        (snapshot / "runtime.tar.gz").write_bytes(b"broken")
        self.log.write_text("")
        result = self.script("rollback-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.new)
        self.assertNotIn("pm2", self.log.read_text())

    def test_missing_snapshot_does_not_change_source(self):
        result = self.script("rollback-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assert_old_restored()

    def test_dirty_or_untracked_source_is_refused(self):
        for path in ("version.txt", "untracked-user-file.txt"):
            with self.subTest(path=path):
                self.write(path, "local work")
                result = self.script("deploy-telecampaign.sh")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("local changes", result.stderr)
                if path == "version.txt":
                    self.git("checkout", "--", path)
                else:
                    (self.root / path).unlink()
        self.assert_old_restored()

    def test_schema_change_is_refused_before_backup_or_stop(self):
        self.git("reset", "--hard", self.new)
        self.write("lib/db/src/schema/test.ts", "// different schema\n")
        self.git("add", ".")
        self.git("commit", "-qm", "schema")
        self.git("push", "origin", "main")
        self.git("reset", "--hard", self.old)
        result = self.script("deploy-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Database package changed", result.stderr)
        self.assertFalse(self.log.exists())
        self.assert_old_restored()

    def test_manual_rollback_rejects_schema_mismatch(self):
        self.assertEqual(self.script("checkpoint-telecampaign.sh").returncode, 0)
        self.write("lib/db/src/schema/test.ts", "// different schema\n")
        self.git("add", ".")
        self.git("commit", "-qm", "schema applied outside safe deploy")
        self.log.write_text("")
        result = self.script("rollback-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Database package differs", result.stderr)
        self.assertNotIn("pm2", self.log.read_text())

    def test_missing_build_prevents_source_replacement(self):
        (self.root / "artifacts/api-server/dist/index.mjs").unlink()
        result = self.script("deploy-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.old)
        self.assertNotIn("pnpm", self.log.read_text())

    def test_concurrent_operation_is_refused(self):
        import fcntl
        with (self.base / "operation.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.script("checkpoint-telecampaign.sh")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Another TeleCampaign operation", result.stderr)
        self.assert_old_restored()

    def test_noop_deploy_does_not_overwrite_checkpoint(self):
        self.assertEqual(self.script("deploy-telecampaign.sh").returncode, 0)
        previous = (self.releases / "PREVIOUS").read_text()
        self.assertEqual(self.script("deploy-telecampaign.sh").returncode, 0)
        self.assertEqual((self.releases / "PREVIOUS").read_text(), previous)

    def test_restore_health_failure_leaves_only_this_api_stopped(self):
        self.assertEqual(self.script("deploy-telecampaign.sh").returncode, 0)
        self.write("scripts/telecampaign-healthcheck.sh", "#!/bin/sh\nexit 1\n")
        # Force failure through a mock PM2 command, not a dirty tracked script:
        self.git("checkout", "--", "scripts/telecampaign-healthcheck.sh")
        self.executable("pm2", """#!/usr/bin/env bash
echo "pm2 $*" >> "$TEST_LOG"
[[ "$2" == telecampaign-api ]] || exit 99
if [[ "$1" == restart ]]; then exit 1; fi
echo stopped > "$TEST_ROOT/process-state"
""")
        result = self.script("rollback-telecampaign.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "process-state").read_text(), "stopped\n")
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.old)

    def test_invalid_deploy_target_is_rejected(self):
        result = self.script("deploy-telecampaign.sh", "--upload-pack=bad")
        self.assertEqual(result.returncode, 2)
        self.assert_old_restored()

    def test_checkpoint_outside_protected_directory_is_refused(self):
        result = self.script("rollback-telecampaign.sh", str(self.base))
        self.assertNotEqual(result.returncode, 0)
        self.assert_old_restored()

    def test_deploy_can_run_from_protected_control_copy(self):
        control = self.base / "control"
        shutil.copytree(self.root / "scripts", control)
        result = self.cmd(["bash", str(control / "deploy-telecampaign.sh")], check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.new)
        result = self.cmd(["bash", str(control / "rollback-telecampaign.sh"), "--previous"], check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_old_restored()

    def test_build_heap_limit_does_not_change_api_node_options(self):
        self.env["NODE_OPTIONS"] = "--no-warnings"
        self.env["TELECAMPAIGN_BUILD_NODE_OPTIONS"] = "--max-old-space-size=128"
        result = self.script("deploy-telecampaign.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text()
        self.assertIn("build_node_options=--max-old-space-size=128", log)
        self.assertIn("pm2_node_options=--no-warnings", log)
        self.assertNotIn("pm2_node_options=--max-old-space-size", log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
