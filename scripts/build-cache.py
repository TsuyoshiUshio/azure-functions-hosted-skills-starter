"""Refresh the reviewed, pinned cache. Maintainer-only; bootstrap never needs Python."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def download_archive(repository, commit, destination):
    destination.mkdir(parents=True)
    url = f"https://codeload.github.com/{repository}/zip/{commit}"
    archive = destination / "source.zip"
    with urllib.request.urlopen(url, timeout=60) as response:
        archive.write_bytes(response.read())
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            path = Path(item.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in item.filename:
                raise ValueError(f"Unsafe archive member: {item.filename}")
        package.extractall(destination)
    return destination / f"{repository.split('/')[-1]}-{commit}"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_regular_tree(directory):
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"Expected a regular directory: {directory}")
    for path in directory.rglob("*"):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError(f"Unsupported cache/source entry: {path}")


def stage_telemetry(root, staged):
    lock = json.loads((root / "skills.lock.json").read_text())
    paths = {
        "telemetry.mjs": "plugin/hooks/runtime/telemetry.mjs",
        "arm-deployments.mjs": "plugin/hooks/runtime/arm-deployments.mjs",
        "telemetry-config.json": "plugin/hooks/runtime/telemetry-config.json",
        "upstream-LICENSE": "plugin/upstream-LICENSE",
        "enabled.json": "plugin/hooks/telemetry.config.json",
        "claude.json": "assets/setup/claude/.claude/settings.json",
        "codex.json": "assets/setup/codex/.codex/hooks.json",
        "copilot.json": "assets/setup/copilot/.github/hooks/hosted-skills-starter.json",
    }
    destination = staged / "telemetry"
    destination.mkdir()
    for name, relative in paths.items():
        path = root
        for part in relative.split("/"):
            path = path / part
            if path.is_symlink():
                raise ValueError(f"Unsupported telemetry source link: {path}")
        if not path.is_file() or lock["files"].get(relative) != digest(path):
            raise ValueError(f"Unverified telemetry source: {relative}")
        shutil.copyfile(path, destination / name)
    if json.loads((destination / "enabled.json").read_text()) != {"enabled": True}:
        raise ValueError("Telemetry default contract changed; review before refreshing.")
    (destination / "disabled.json").write_text(
        '{\n  "enabled": false\n}\n', encoding="utf-8", newline="\n")


def stage_skills(root, staged, sources):
    for path in (root / "plugin", root / "scripts", root / "skills.lock.json"):
        if path.is_symlink():
            raise ValueError(f"Unsupported cache/source entry: {path}")
    assert_regular_tree(root / "scripts" / "agent-files")
    lock = json.loads((root / "skills.lock.json").read_text())
    if sources["skills"]["source"] != "plugin/skills":
        raise ValueError("Skill sources must use the canonical plugin/skills directory.")
    source = root / "plugin" / "skills"
    assert_regular_tree(source)
    names = sources["skills"]["names"]
    actual = sorted(path.name for path in source.iterdir())
    if (sorted(names) != actual or len(names) != len(set(names))
            or set(names) != set(lock["skills"]) | {"skills-update"}
            or sources["skills"]["upstream"] != lock["upstream"]
            or sources["skills"]["commit"] != lock["commit"]):
        raise ValueError("Skill inventory/revision changed; review cache-sources.json first.")
    expected = {path for path in lock["files"] if path.startswith("plugin/skills/")}
    actual_files = {file.relative_to(root).as_posix()
                    for file in source.rglob("*") if file.is_file()}
    if actual_files != expected:
        raise ValueError("Distribution skill files differ from the lock inventory.")
    skill = staged / "skill"
    skill.mkdir()
    for name in names:
        if not (source / name / "SKILL.md").is_file():
            raise ValueError(f"Missing skill entry point: {name}")
        shutil.copytree(source / name, skill / name)
    for file in source.rglob("*"):
        if file.is_file():
            path = file.relative_to(root).as_posix()
            if lock["files"].get(path) != digest(file):
                raise ValueError(f"Unverified distribution skill: {path}")
    license_path = root / "plugin" / "upstream-LICENSE"
    if license_path.is_symlink() or lock["files"].get("plugin/upstream-LICENSE") != digest(license_path):
        raise ValueError("Unverified upstream license.")
    shutil.copyfile(license_path, skill / "LICENSE")
    updater = skill / "skills-update" / "SKILL.md"
    text = updater.read_text(encoding="utf-8")
    heading = "## Identify the installation"
    if text.count(heading) != 1:
        raise ValueError("Updater entry contract changed; review the bootstrap adapter.")
    text = text.replace(heading,
        "For a cached-template bootstrap with `.hosted-skills-skills.json`, use\n"
        "[the bootstrap update workflow](references/bootstrap-installation.md)\n"
        "instead of the workspace/plugin workflow below. Return after that workflow.\n\n"
        + heading)
    updater.write_text(text, encoding="utf-8", newline="\n")
    reference = skill / "skills-update" / "references" / "bootstrap-installation.md"
    reference.parent.mkdir(parents=True)
    reference.write_text(
        (root / "scripts" / "agent-files" / "bootstrap-updates.md").read_text(encoding="utf-8"),
        encoding="utf-8", newline="\n")
    record = {
        "schemaVersion": 1,
        "source": sources["skills"],
        "adaptations": {"skills-update": "bootstrap-installation-v1"},
        "files": {file.relative_to(skill).as_posix(): digest(file)
                  for file in sorted(skill.rglob("*")) if file.is_file()},
    }
    (staged / "skills.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
    agent_files = staged / "agent-files"
    agent_files.mkdir()
    for name in ("AGENTS.md", "CLAUDE.md", "copilot-instructions.md"):
        text = (root / "scripts" / "agent-files" / name).read_text(encoding="utf-8")
        (agent_files / name).write_text(text, encoding="utf-8", newline="\n")


def write_manifest(staged):
    rows = []

    def add(scope, source, destination):
        rows.append((scope, digest(source), source.relative_to(staged).as_posix(), destination))

    app = staged / "app"
    for file in sorted(app.rglob("*")):
        if file.is_file():
            destination = file.relative_to(app).as_posix()
            add("common", file, ".gitignore" if destination == "gitignore.template" else destination)
    add("common", staged / "skills.json", ".hosted-skills-skills.json")
    for scope, prefix in (("agents", ".agents/skills"), ("claude", ".claude/skills")):
        for file in sorted((staged / "skill").rglob("*")):
            if file.is_file():
                add(scope, file, f"{prefix}/{file.relative_to(staged / 'skill').as_posix()}")
    for scope, source, destination in (
        ("common", "AGENTS.md", "AGENTS.md"),
        ("claude", "CLAUDE.md", "CLAUDE.md"),
        ("copilot", "copilot-instructions.md", ".github/copilot-instructions.md"),
    ):
        add(scope, staged / "agent-files" / source, destination)
    for name in ("telemetry.mjs", "arm-deployments.mjs", "telemetry-config.json", "upstream-LICENSE"):
        add("common", staged / "telemetry" / name, f".hosted-skills-starter/{name}")
    for scope, name in (("preference-on", "enabled.json"), ("preference-off", "disabled.json")):
        add(scope, staged / "telemetry" / name, ".hosted-skills-starter/telemetry.config.json")
    for scope, name, destination in (
        ("claude", "claude.json", ".claude/settings.json"),
        ("codex", "codex.json", ".codex/hooks.json"),
        ("copilot", "copilot.json", ".github/hooks/hosted-skills-starter.json"),
    ):
        add(scope, staged / "telemetry" / name, destination)
    (staged / "files.tsv").write_text(
        "".join("\t".join(row) + "\n" for row in rows), encoding="utf-8", newline="\n")
    return rows


def refresh_skills(root, cache, sources):
    assert_regular_tree(cache)
    tracked = {"files.tsv"}
    for row in (cache / "files.tsv").read_text().splitlines():
        _, expected, source, _ = row.split("\t")
        if (Path(source).is_absolute() or "\\" in source or ".." in Path(source).parts
                or digest(cache / source) != expected):
            raise ValueError(f"Existing cache drift; nothing refreshed: {source}")
        tracked.add(source)
    actual = {file.relative_to(cache).as_posix()
              for file in cache.rglob("*") if file.is_file()}
    if actual != tracked:
        raise ValueError("Existing cache drift; unmanifested files require review.")
    with tempfile.TemporaryDirectory(prefix="hosted-skills-cache-") as directory:
        staged = Path(directory) / "cache"
        staged.mkdir()
        shutil.copytree(cache / "app", staged / "app")
        stage_skills(root, staged, sources)
        stage_telemetry(root, staged)
        rows = write_manifest(staged)
        # Replace only reviewed authoring assets, never the application snapshot.
        shutil.rmtree(cache / "skill")
        shutil.copytree(staged / "skill", cache / "skill")
        if (cache / "telemetry").exists():
            shutil.rmtree(cache / "telemetry")
        shutil.copytree(staged / "telemetry", cache / "telemetry")
        for file in (staged / "agent-files").iterdir():
            shutil.copyfile(file, cache / "agent-files" / file.name)
        for name in ("skills.json", "files.tsv"):
            shutil.copyfile(staged / name, cache / name)
        return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-skills", action="store_true",
                        help="Refresh reviewed skills, hooks and instructions locally; no download.")
    args = parser.parse_args()
    sources = json.loads((ROOT / "scripts" / "cache-sources.json").read_text())
    cache = ROOT / "cache"
    if args.refresh_skills:
        rows = refresh_skills(ROOT, cache, sources)
        print(f"Refreshed {len(rows)} file mappings; application cache unchanged.")
        return
    if cache.exists():
        raise SystemExit("cache already exists; move it aside for a reviewed refresh.")
    with tempfile.TemporaryDirectory(prefix="hosted-skills-cache-") as directory:
        temporary = Path(directory)
        template = download_archive(
            sources["template"]["repository"], sources["template"]["commit"],
            temporary / "template",
        )
        staged = temporary / "cache"
        app = staged / "app"
        app.mkdir(parents=True)
        for name in (".gitignore", "LICENSE", "README.md", "azure.yaml", "infra", "src"):
            source = template / name
            if source.is_dir():
                shutil.copytree(source, app / name)
            else:
                shutil.copyfile(source, app / name)
        shutil.copyfile(app / "src" / "local.settings.json.sample",
                        app / "src" / "local.settings.json")
        # Local settings contain placeholders only, never developer credentials.
        with (app / ".gitignore").open("ab") as file:
            file.write(b"\n# Local Hosted Skills configuration\nsrc/local.settings.json\n")
        # A live .gitignore inside the cache would hide the placeholder settings
        # from this repository. Only activate it in the generated application.
        (app / ".gitignore").rename(app / "gitignore.template")
        stage_skills(ROOT, staged, sources)
        stage_telemetry(ROOT, staged)
        (app / ".hosted-skills-template.json").write_text(
            json.dumps(sources, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
        rows = write_manifest(staged)
        shutil.copytree(staged, cache)
        print(f"Cached {len(rows)} file mappings from pinned upstream sources.")


if __name__ == "__main__":
    main()
