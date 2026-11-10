"""Contract tests. Python is test tooling only, never a bootstrap dependency."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PIN = "a" * 40


def shell_path(path):
    value = str(path)
    if os.name == "nt":
        value = value.replace("\\", "/")
    if os.name == "nt" and len(value) > 1 and value[1] == ":":
        return "/" + value[0].lower() + value[2:]
    return value


class BootstrapContract:
    engine = None
    executable = None

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="hosted-skills-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / "starter with spaces"
        self.source.mkdir()
        shutil.copytree(ROOT / "cache", self.source / "cache")
        for name in ("bootstrap.ps1", "bootstrap.sh", "install.ps1", "install.sh"):
            shutil.copyfile(ROOT / name, self.source / name)
        self.target = self.base / "my app \u65e5\u672c\u8a9e"

    def run_bootstrap(self, *arguments, agent="all", destination=None):
        target = destination or self.target
        if self.engine == "sh":
            translated = {"-Check": "--check"}
            args = [self.executable, shell_path(self.source / "bootstrap.sh"),
                    "--destination", shell_path(target), "--agent", agent, "--json"]
            args.extend(translated.get(arg, arg) for arg in arguments)
        else:
            args = [self.executable, "-NoProfile", "-NonInteractive", "-File",
                    str(self.source / "bootstrap.ps1"), "-Destination", str(target),
                    "-Agent", agent, "-Json", *arguments]
        return subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                              timeout=60, cwd=ROOT)

    def report(self, process, expected=0):
        self.assertEqual(process.returncode, expected, process.stdout + process.stderr)
        return json.loads(process.stdout)

    def test_apply_and_rerun_are_byte_identical(self):
        first = self.report(self.run_bootstrap())
        self.assertTrue(first["authorReady"])
        self.assertEqual(first["templateSource"], "repository-cache")
        self.assertEqual(first["localRun"], "not-verified")
        self.assertEqual(first["deployment"], "not-verified")
        self.assertGreater(first["filesCreated"], 40)
        rows = (self.source / "cache" / "files.tsv").read_text().splitlines()
        expected = set()
        for row in rows:
            _, digest, _, destination = row.split("\t")
            output = self.target / destination
            expected.add(destination)
            self.assertEqual(hashlib.sha256(output.read_bytes()).hexdigest(), digest)
        actual = {file.relative_to(self.target).as_posix()
                  for file in self.target.rglob("*") if file.is_file()}
        self.assertEqual(actual, expected)
        again = self.report(self.run_bootstrap())
        self.assertEqual(again["filesCreated"], 0)
        self.assertTrue(self.report(self.run_bootstrap("-Check"))["authorReady"])
        settings = json.loads((self.target / "src" / "local.settings.json").read_text())
        self.assertEqual(settings["Values"]["FOUNDRY_PROJECT_ENDPOINT"], "")
        self.assertIn("azurefunctions-agents-runtime[monitor]",
                      (self.target / "src" / "requirements.txt").read_text())

    def test_agent_specific_layouts(self):
        for agent in ("copilot", "claude", "codex"):
            with self.subTest(agent=agent):
                target = self.base / agent
                self.report(self.run_bootstrap(agent=agent, destination=target))
                self.assertEqual((target / ".agents" / "skills").exists(),
                                 agent in ("copilot", "codex"))
                self.assertEqual((target / ".claude" / "skills").exists(), agent == "claude")
                self.assertEqual((target / ".github" / "copilot-instructions.md").exists(),
                                 agent == "copilot")
                self.assertEqual((target / "CLAUDE.md").exists(), agent == "claude")
                self.assertTrue((target / "AGENTS.md").exists())

    def test_check_is_read_only(self):
        report = self.report(self.run_bootstrap("-Check"), expected=1)
        self.assertFalse(report["authorReady"])
        self.assertGreater(report["filesMissing"], 0)
        self.assertFalse(self.target.exists())

    def test_conflict_prevents_all_writes(self):
        conflict = self.target / ".github" / "copilot-instructions.md"
        conflict.parent.mkdir(parents=True)
        conflict.write_text("keep my instructions")
        process = self.run_bootstrap()
        self.assertEqual(process.returncode, 2, process.stdout + process.stderr)
        self.assertEqual(conflict.read_text(), "keep my instructions")
        self.assertFalse((self.target / "src").exists())
        self.assertFalse((self.target / "AGENTS.md").exists())

    def test_customized_file_is_not_overwritten(self):
        self.report(self.run_bootstrap())
        app = self.target / "src" / "function_app.py"
        app.write_text("# user changes\n")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertEqual(app.read_text(), "# user changes\n")

    def test_corrupt_cache_prevents_all_writes(self):
        file = self.source / "cache" / "app" / "src" / "function_app.py"
        file.write_bytes(b"corrupted")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertFalse(self.target.exists())

    def test_parent_file_prevents_all_writes(self):
        self.target.mkdir()
        (self.target / "src").write_text("not a directory")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertEqual(list(self.target.iterdir()), [self.target / "src"])

    def test_unsafe_manifest_path_prevents_all_writes(self):
        manifest = self.source / "cache" / "files.tsv"
        rows = manifest.read_text().splitlines()
        fields = rows[-1].split("\t")
        fields[-1] = "../escaped.txt"
        manifest.write_text("\n".join(rows[:-1] + ["\t".join(fields)]) + "\n")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertFalse(self.target.exists())
        self.assertFalse((self.base / "escaped.txt").exists())

    def test_duplicate_manifest_prevents_all_writes(self):
        manifest = self.source / "cache" / "files.tsv"
        text = manifest.read_text()
        manifest.write_text(text + text.splitlines()[0] + "\n")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertFalse(self.target.exists())

    def test_invalid_manifest_prevents_all_writes(self):
        (self.source / "cache" / "files.tsv").write_text("common\tinvalid\n")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertFalse(self.target.exists())

    def test_source_and_ancestor_destinations_rejected(self):
        for target in (self.source, self.source / "cache", self.base):
            with self.subTest(target=target):
                self.assertEqual(self.run_bootstrap(destination=target).returncode, 2)
                self.assertFalse((target / "azure.yaml").exists())

    def test_target_link_prevents_all_writes(self):
        outside = self.base / "outside"
        outside.mkdir()
        self.target.mkdir()
        try:
            (self.target / "src").symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"Symlink creation unavailable: {error}")
        self.assertEqual(self.run_bootstrap().returncode, 2)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertFalse((self.target / "azure.yaml").exists())

    def test_minimal_posix_environment_and_shasum(self):
        if self.engine != "sh" or os.name == "nt":
            self.skipTest("Native POSIX prerequisite inventory test")
        commands = self.base / "minimal-bin"
        commands.mkdir()
        for tool in ("awk", "cmp", "dirname", "mkdir", "mktemp", "cat", "rm", "rmdir", "shasum"):
            executable = shutil.which(tool)
            if not executable:
                self.skipTest(f"Optional fallback test utility unavailable: {tool}")
            (commands / tool).symlink_to(executable)
        environment = os.environ.copy()
        environment["PATH"] = str(commands)
        process = subprocess.run(
            [self.executable, str(self.source / "bootstrap.sh"),
             "--destination", str(self.target), "--json"],
            env=environment, capture_output=True, text=True, encoding="utf-8", timeout=60,
        )
        report = self.report(process)
        self.assertTrue(report["authorReady"])
        self.assertTrue(all(not found for found in report["toolsDetected"].values()))

    def test_json_destination_escaping(self):
        if os.name == "nt":
            self.skipTest("Quote and backslash filename characters require POSIX")
        target = self.base / 'app "quoted" \\ path'
        report = self.report(self.run_bootstrap(destination=target))
        self.assertEqual(report["destination"], str(target))
        self.assertTrue((target / "azure.yaml").exists())

    def test_remote_installer_with_offline_download(self):
        """Exercise resolve/download/apply without publishing or network access."""
        folder = f"azure-functions-hosted-skills-starter-{PIN}"
        environment = os.environ.copy()
        if self.engine == "sh":
            archive = self.base / "starter.tar.gz"
            with tarfile.open(archive, "w:gz") as package:
                package.add(self.source, arcname=folder)
            commands = self.base / "bin"
            commands.mkdir()
            curl = commands / "curl"
            curl.write_text(
                '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n'
                'if [ "$1" = -o ]; then cp "$TEST_ARCHIVE" "$2"; exit; fi\n'
                'shift\ndone\nexit 2\n', newline="\n"
            )
            curl.chmod(0o755)
            environment["TEST_BIN"] = shell_path(commands)
            environment["TEST_INSTALLER"] = shell_path(self.source / "install.sh")
            environment["TEST_ARCHIVE"] = shell_path(archive)
            # Set PATH after MSYS startup, which otherwise prepends its real curl.
            args = [self.executable, "-c",
                    'PATH="$TEST_BIN:$PATH"; export PATH; . "$TEST_INSTALLER"',
                    "installer-test",
                    "--ref", PIN, "--destination", shell_path(self.target), "--json"]
        else:
            archive = self.base / "starter.zip"
            with zipfile.ZipFile(archive, "w") as package:
                for file in self.source.rglob("*"):
                    if file.is_file():
                        package.write(file, f"{folder}/{file.relative_to(self.source).as_posix()}")
            environment["TEST_ARCHIVE"] = str(archive)
            environment["TEST_INSTALLER"] = str(self.source / "install.ps1")
            environment["TEST_DESTINATION"] = str(self.target)
            script = (
                "function Invoke-WebRequest { param($UseBasicParsing, $Uri, $OutFile, $TimeoutSec) "
                "Copy-Item -LiteralPath $env:TEST_ARCHIVE -Destination $OutFile }; "
                f"& $env:TEST_INSTALLER -Ref '{PIN}' -Destination $env:TEST_DESTINATION -Json"
            ).replace("param($UseBasicParsing,", "param([switch]$UseBasicParsing,")
            args = [self.executable, "-NoProfile", "-NonInteractive", "-Command", script]
        process = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                                 timeout=60, env=environment, cwd=ROOT)
        self.assertTrue(self.report(process)["authorReady"])
        self.assertTrue((self.target / "src" / "function_app.py").is_file())


ENGINES = {
    "sh": os.environ.get("BOOTSTRAP_SH") or shutil.which("sh") or shutil.which("bash"),
    "pwsh": shutil.which("pwsh"),
    "powershell": shutil.which("powershell") if os.name == "nt" else None,
}
requested = os.environ.get("BOOTSTRAP_ENGINES")
if requested:
    for engine in requested.split(","):
        if not ENGINES.get(engine):
            raise RuntimeError(f"Requested test engine is unavailable: {engine}")
for name, executable in ENGINES.items():
    if executable and (not requested or name in requested.split(",")):
        globals()[f"Test_{name}"] = type(
            f"Test_{name}", (BootstrapContract, unittest.TestCase),
            {"engine": name, "executable": executable},
        )


if __name__ == "__main__":
    unittest.main()
