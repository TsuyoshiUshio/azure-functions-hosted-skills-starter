"""Verify the bootstrap snapshot without network, model calls, or installations."""

import hashlib
import json
from pathlib import Path
import runpy
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BUILDER = runpy.run_path(str(ROOT / "scripts" / "build-cache.py"))
NAMES = {
    "azure-functions-hosted-skills",
    "azure-functions-hosted-skills-migrate",
    "azure-functions-connector-create",
    "azure-functions-connector-mcp",
    "azure-functions-connector-validate",
    "skills-update",
}


def inventory(directory):
    return {path.relative_to(directory).as_posix():
            hashlib.sha256(path.read_bytes()).hexdigest()
            for path in directory.rglob("*") if path.is_file()}


class TestSkillCache(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hosted-skills-cache-test-")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / "distribution"
        self.root.mkdir()
        for path in ("cache", "scripts/agent-files", "plugin/skills", "plugin/hooks", "assets/setup"):
            shutil.copytree(ROOT / path, self.root / path)
        shutil.copyfile(ROOT / "plugin" / "upstream-LICENSE",
                        self.root / "plugin" / "upstream-LICENSE")
        shutil.copyfile(ROOT / "skills.lock.json", self.root / "skills.lock.json")
        self.sources = json.loads((ROOT / "scripts" / "cache-sources.json").read_text())
        self.cache = self.root / "cache"

    def refresh(self):
        with patch("urllib.request.urlopen", side_effect=AssertionError("Unexpected network")):
            return BUILDER["refresh_skills"](self.root, self.cache, self.sources)

    def test_snapshot_is_complete_and_matches_canonical_distribution(self):
        record = json.loads((self.cache / "skills.json").read_text())
        self.assertEqual(set(record["source"]["names"]), NAMES)
        self.assertEqual(record["files"], inventory(self.cache / "skill"))
        for source in (ROOT / "plugin" / "skills").rglob("*"):
            if source.is_file():
                relative = source.relative_to(ROOT / "plugin" / "skills")
                output = self.cache / "skill" / relative
                if relative.as_posix() != "skills-update/SKILL.md":
                    self.assertEqual(source.read_bytes(), output.read_bytes(), str(relative))
                else:
                    original = source.read_text(encoding="utf-8")
                    adapted = output.read_text(encoding="utf-8")
                    marker = "## Identify the installation"
                    prefix = original.split(marker)[0]
                    self.assertTrue(adapted.startswith(prefix))
                    self.assertTrue(adapted.endswith(original.split(marker, 1)[1]))
                    self.assertIn("references/bootstrap-installation.md", adapted)
        self.assertEqual((self.cache / "skill" / "LICENSE").read_bytes(),
                         (ROOT / "plugin" / "upstream-LICENSE").read_bytes())
        reference = (self.cache / "skill" / "skills-update" / "references" /
                     "bootstrap-installation.md").read_text(encoding="utf-8")
        for boundary in ("Do not run `setup.mjs`", "Do not execute downloaded scripts",
                         "Obtain approval for the exact revision", "symlinks",
                         "preserve", "unrelated", "No initial setup tools"):
            self.assertIn(boundary, reference)

    def test_offline_refresh_is_reproducible_and_preserves_every_template_byte(self):
        before = inventory(self.cache)
        self.refresh()
        self.assertEqual(inventory(self.cache), before)

    def test_telemetry_sources_match_locked_runtime_and_native_hooks(self):
        for name in ("telemetry.mjs", "arm-deployments.mjs", "telemetry-config.json"):
            self.assertEqual((self.cache / "telemetry" / name).read_bytes(),
                             (ROOT / "plugin" / "hooks" / "runtime" / name).read_bytes())
        for agent, relative in (
            ("claude", ".claude/settings.json"),
            ("codex", ".codex/hooks.json"),
            ("copilot", ".github/hooks/hosted-skills-starter.json"),
        ):
            self.assertEqual((self.cache / "telemetry" / f"{agent}.json").read_bytes(),
                             (ROOT / "assets" / "setup" / agent / relative).read_bytes())
        for name, enabled in (("enabled.json", True), ("disabled.json", False)):
            self.assertEqual(json.loads((self.cache / "telemetry" / name).read_text()),
                             {"enabled": enabled})
        self.assertEqual((self.cache / "telemetry" / "upstream-LICENSE").read_bytes(),
                         (ROOT / "plugin" / "upstream-LICENSE").read_bytes())

    def test_telemetry_source_drift_prevents_all_cache_changes(self):
        before = inventory(self.cache)
        for relative in (
            "plugin/hooks/runtime/telemetry.mjs",
            "assets/setup/claude/.claude/settings.json",
        ):
            source = self.root / relative
            original = source.read_bytes()
            source.write_bytes(b"unreviewed telemetry contract")
            with self.assertRaisesRegex(ValueError, "Unverified telemetry source"):
                self.refresh()
            self.assertEqual(inventory(self.cache), before)
            source.write_bytes(original)

    def test_canonical_drift_or_missing_file_prevents_refresh(self):
        source = (self.root / "plugin" / "skills" / "azure-functions-connector-mcp" /
                  "references" / "metadata-to-mcp.md")
        before = inventory(self.cache)
        source.write_text("changed source")
        with self.assertRaisesRegex(ValueError, "Unverified distribution"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)
        source.unlink()
        with self.assertRaisesRegex(ValueError, "lock inventory"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)

    def test_unreviewed_skill_inventory_prevents_refresh(self):
        before = inventory(self.cache)
        extra = self.root / "plugin" / "skills" / "unexpected-dependency"
        extra.mkdir()
        (extra / "SKILL.md").write_text("---\nname: unexpected-dependency\n---\n")
        with self.assertRaisesRegex(ValueError, "inventory/revision"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)

    def test_unreviewed_revision_prevents_refresh(self):
        before = inventory(self.cache)
        self.sources["skills"]["commit"] = "b" * 40
        with self.assertRaisesRegex(ValueError, "inventory/revision"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)

    def test_unmanifested_cache_files_are_preserved_and_prevent_refresh(self):
        (self.cache / "skill" / "keep-local.txt").write_text("preserve this file")
        before = inventory(self.cache)
        with self.assertRaisesRegex(ValueError, "unmanifested files"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)

    def test_cache_drift_prevents_refresh(self):
        source = self.cache / "skill" / "azure-functions-hosted-skills" / "SKILL.md"
        source.write_text("preserve local cache edit")
        before = inventory(self.cache)
        with self.assertRaisesRegex(ValueError, "cache drift"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)

    def test_source_links_prevent_refresh(self):
        source = (self.root / "plugin" / "skills" / "azure-functions-connector-mcp" /
                  "references" / "linked.md")
        outside = self.base / "outside.md"
        outside.write_text("not a distribution asset")
        try:
            source.symlink_to(outside)
        except OSError as error:
            self.skipTest(f"Creating a symlink is unavailable: {error}")
        before = inventory(self.cache)
        with self.assertRaisesRegex(ValueError, "Unsupported cache/source"):
            self.refresh()
        self.assertEqual(inventory(self.cache), before)


if __name__ == "__main__":
    unittest.main()
