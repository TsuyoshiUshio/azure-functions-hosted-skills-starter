# Fast bootstrap with a cached application template

This optional path creates a **new app**, rather than installing the existing
six-skill workspace/plugin integration. It copies one upstream authoring skill,
the official sample application, and thin coding-agent instructions. Use one
route per workspace to avoid duplicate installations.

## Two ways to try it

Run in the intended app directory. All four entrypoints default to the current
directory, without creating a `my-hosted-skill` subdirectory. Specify
`-Destination <path>` / `--destination <path>` only to choose a different location.
Existing conflicting files still stop the entire apply before any writes.

When running from the starter checkout or extracted archive itself, explicitly
select a separate app destination (Copilot shown); applying over the starter
distribution remains prohibited:

```powershell
.\bootstrap.ps1 -Destination .\my-hosted-skill -Agent copilot
```

```sh
sh ./bootstrap.sh --destination ./my-hosted-skill --agent copilot
```

Or ask the coding agent:

> Follow start.md's fast bootstrap path to create a new app with the cached
> template in the current directory. Use the same bootstrap as the terminal route.
> Do not install tools, run the app, or deploy.

Both entrypoints apply the same cache and prerequisite checks. Open the reported
destination in the agent after setup and describe what you want to build.
Choose `copilot`, `claude`, or `codex` to match your coding agent. Omit the
agent argument for an interactive selection; `all` is an explicit opt-in for
multiple agents, never the default. With `-Json` / `--json`, specify the agent
so automation cannot wait on a prompt. `start.md` uses the actual running agent
and asks only when unknown.

| Selection | Skill root | Instructions |
| --- | --- | --- |
| Copilot | `.agents/skills` | `AGENTS.md`, `.github/copilot-instructions.md` |
| Claude Code | `.claude/skills` | `AGENTS.md`, `CLAUDE.md` |
| Codex | `.agents/skills` | `AGENTS.md` |
| All | Both roots | All of the above |

Skills are copied, not symlinked. No home-directory settings, MCP servers,
telemetry hooks, or plugin registrations are installed. This bootstrap makes no
telemetry requests and does not change existing workspace/plugin opt-outs.
Restart/reopen your agent if newly added skills are not discovered.

## Prerequisites and readiness

Bootstrap needs no Node.js, Python, Git, Azure CLI, azd, or development MCP.
Windows uses built-in Windows PowerShell 5.1 or PowerShell 7 and .NET.
macOS/Linux use POSIX shell and standard OS utilities: `awk`, `cmp`, `dirname`,
`mkdir`, `mktemp`, `cat`, `rm`, `rmdir`, plus `sha256sum` or `shasum`. Minimal
Linux images may need those utilities. No package manager is invoked.
Follow organizational execution policy; bootstrap does not bypass it.

Add `-Json` / `--json` for a structured report, and `-Check` / `--check` for a
read-only baseline inspection. Exit codes: **0** = Author-ready, **1** =
inspection found missing files, **2** = failure/conflict. Check both exit code
and `authorReady`; shell failures use stderr, while PowerShell also returns a
JSON error when requested.

`toolsDetected` inventories optional commands on PATH only. It does not verify
versions, services, credentials or model connectivity. `localRun` and
`deployment` remain `not-verified`. No tools are installed, hosts started,
sign-ins performed, Azure resources provisioned, or applications deployed.

An unchanged rerun creates zero files. Different existing files, file/directory
collisions, and links/junctions within apply paths are rejected before writes.
The shell resolves existing destination parents for its distribution guard,
including macOS `/var` aliases and Windows short paths, without creating files.
PowerShell uses literal .NET filesystem paths so valid POSIX filename characters
such as backslashes are preserved during apply, rerun, and inspection.
Unrelated files remain. There is no force option. Check mode compares the cached
baseline, not a customized app's correctness; do not reapply over an edited app.
Disk or permission failures during copying may leave a partial new app. No
automatic rollback/deletion occurs; fix the cause and rerun.

## Remote one-liners

These installers download the public
`TsuyoshiUshio/azure-functions-hosted-skills-starter` repository. The default is
**latest main**, with no ref argument required. The installer resolves main
once through GitHub's API, validates its full commit SHA, and downloads only
that immutable snapshot. The actual repository, requested ref and resolved SHA
are recorded in `.hosted-skills-bootstrap.json` and the `starterSource` report.
Lookup failures, invalid responses and API rate limits stop installation;
there is no fallback to another version. No GitHub token is required.

After this PR is merged, use these one-liners (Copilot shown):

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.ps1'))) -Destination . -Agent copilot
```

```sh
(set -eu; installer=$(mktemp); trap 'rm -f "$installer"' EXIT; curl -fsSL --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.sh' -o "$installer"; sh "$installer" --destination . --agent copilot)
```

Change `copilot` to `claude` or `codex`, or omit the agent argument to select it
interactively. To test before merge or reproduce a specific version, download
the installer from that full commit SHA instead of `main` and add
`-Ref <40-character-SHA>` / `--ref <40-character-SHA>` to its arguments.
An explicit SHA bypasses the main lookup. `main` is also accepted explicitly;
arbitrary branch/tag names are not accepted.

These commands execute downloaded code. Use the SHA-pinned route if your policy
requires reviewing an immutable installer. Temporary distribution files are removed;
the generated app remains. POSIX download also needs `curl`, `tar` and GitHub
HTTPS access. API lookup uses `curl` on POSIX and built-in web cmdlets on Windows,
not `jq`, Node, Python or `gh`. Local checkout bootstrap needs no lookup and
reports `starterSource: null`; template/skill provenance is still recorded.

## Cache contract and maintenance

The v1 cache is **still the official daily-blog sample**, with chat endpoints, a
daily timer, dynamic sessions and optional Outlook infrastructure. Adapt/remove
sample features before running or deploying your own scenario. Model endpoints
and Azure-backed services still need configuration. Editable placeholder
`src/local.settings.json` is excluded from Git and deployment in the generated app.

`scripts/cache-sources.json` pins the official `ai-hosted-skills-python`
template (`v1.0.3`) and authoring skill source commits. Upstream MIT licenses are
retained. This snapshot is independent of the existing six-skill distribution's
`skills.lock.json`; it does not replace that distribution or its update flow.
`.hosted-skills-template.json` records the generated app's provenance.

`cache/files.tsv` is the shared apply contract: scope, SHA-256, source path and
destination path. Both OS entrypoints verify selected bytes before applying.
`.gitattributes` preserves cached bytes across checkouts. Future scenario-neutral
template packages can use the same contract with an external resolver. V1 uses
`repository-cache` explicitly; a separate remote template resolver is not yet
implemented. Latest-main resolution updates the starter distribution, not the
upstream template or skill pins within its reviewed cache.

Maintainers can move the existing cache aside and run
`python scripts/build-cache.py` to generate a reviewed replacement from pinned
sources. The builder refuses to replace an existing cache. Never cache secrets.

Run bootstrap contracts with `python -m unittest discover -s tests -v`.
Python is maintenance/test tooling only. The tests exercise available POSIX,
PowerShell 7, and Windows PowerShell engines; require particular engines with
`BOOTSTRAP_ENGINES=sh,pwsh,powershell` and optionally `BOOTSTRAP_SH`.
GitHub Actions runs once per pull request update and on pushes to `main`, across
Windows, macOS and Linux. Tests cover layouts, exact bytes,
reruns, conflicts, corruption, traversal, links, and offline-mocked installation.
