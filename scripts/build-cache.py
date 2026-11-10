"""Refresh the reviewed, pinned cache. Maintainer-only; bootstrap never needs Python."""

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


def main():
    sources = json.loads((ROOT / "scripts" / "cache-sources.json").read_text())
    cache = ROOT / "cache"
    if cache.exists():
        raise SystemExit("cache already exists; move it aside for a reviewed refresh.")
    with tempfile.TemporaryDirectory(prefix="hosted-skills-cache-") as directory:
        temporary = Path(directory)
        template = download_archive(
            sources["template"]["repository"], sources["template"]["commit"],
            temporary / "template",
        )
        skills = download_archive(
            sources["skill"]["repository"], sources["skill"]["commit"],
            temporary / "skills",
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
        shutil.copytree(skills / sources["skill"]["path"],
                        staged / "skill" / "azure-functions-hosted-skills")
        shutil.copyfile(skills / "LICENSE", staged / "skill" / "LICENSE")
        shutil.copytree(ROOT / "scripts" / "agent-files", staged / "agent-files")
        for file in (staged / "agent-files").iterdir():
            file.write_bytes(file.read_bytes().replace(b"\r\n", b"\n"))
        (app / ".hosted-skills-template.json").write_text(
            json.dumps(sources, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
        rows = []

        def add(scope, source, destination):
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            rows.append((scope, digest, source.relative_to(staged).as_posix(), destination))

        for file in sorted(app.rglob("*")):
            if file.is_file():
                destination = file.relative_to(app).as_posix()
                add("common", file, ".gitignore" if destination == "gitignore.template" else destination)
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
        (staged / "files.tsv").write_text(
            "".join("\t".join(row) + "\n" for row in rows),
            encoding="utf-8", newline="\n",
        )
        shutil.copytree(staged, cache)
        print(f"Cached {len(rows)} file mappings from pinned upstream sources.")


if __name__ == "__main__":
    main()
