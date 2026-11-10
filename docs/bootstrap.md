# Fast bootstrap with a cached application template

This default onboarding path creates a **new app** with all six repository
skills, the official sample application, thin coding-agent instructions, and the
selected host's telemetry hooks. It does not install development MCP. Use one
route per workspace to avoid duplicate installations.

The cached payload includes the complete folders, references, assets, and license:

| Skill | Purpose |
| --- | --- |
| `azure-functions-hosted-skills` | Author, extend, run, and deploy under approval |
| `azure-functions-hosted-skills-migrate` | Explicitly requested migration |
| `azure-functions-connector-create` | Connection, identity, and consent |
| `azure-functions-connector-mcp` | Operation schemas and MCP configuration |
| `azure-functions-connector-validate` | Connection and side-effect validation |
| `skills-update` | Reviewed skills-only updates for this bootstrap layout |

Installing migration does not run it; require an explicit request by name.

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

> Follow start.md to create a new app with the cached
> template in the current directory. Use the same bootstrap as the terminal route.
> Do not install tools, run the app, or deploy.

Both entrypoints apply the same cache and prerequisite checks. Open the reported
destination in the agent after setup and describe what you want to build.
Choose `copilot`, `claude`, or `codex` to match your coding agent. Omit the
agent argument for an interactive selection; `all` is an explicit opt-in for
multiple agents, never the default. With `-Json` / `--json`, specify the agent
so automation cannot wait on a prompt. `start.md` selects the OS and actual
running agent from the supplied execution context, executes the matching remote
one-liner once with JSON output, and uses that result for missing-tool guidance
and an immediate authoring handoff. No separate prerequisite scan, source
checkout, MCP discovery, or manual file application is needed.

| Selection | Skill root | Instructions | Telemetry hook |
| --- | --- | --- | --- |
| Copilot | `.agents/skills` | `AGENTS.md`, `.github/copilot-instructions.md` | `.github/hooks/hosted-skills-starter.json` |
| Claude Code | `.claude/skills` | `AGENTS.md`, `CLAUDE.md` | `.claude/settings.json` |
| Codex | `.agents/skills` | `AGENTS.md` | `.codex/hooks.json` |
| All | Both roots | All of the above | All three hooks |

Skills are copied, not symlinked. No home-directory settings, MCP servers,
or plugin registrations are installed. This bootstrap makes no
telemetry requests and does not change existing workspace/plugin opt-outs.
Restart/reopen your agent if newly added skills are not discovered.

### Telemetry hooks

The cache reuses the locked native hook blueprints and Node-standard-API collector
already used by workspace setup, including its ARM helper and upstream license.
The shared runtime lives in `.hosted-skills-starter`. No npm packages or SDKs are
installed. Fresh setup writes `telemetry.config.json` with `enabled: true`
without a choice question. Only subsequent host hook execution can send events;
bootstrap never invokes the sender, probes authentication, or queries Azure.
See [the collection/privacy contract](development.md#telemetry-implementation).

Node.js 22.13+ is optional for setup and needed only for hook execution. Without
Node, the bounded best-effort hook exits harmlessly; no install or fallback runs.
The `telemetry` report describes the local preference and leaves execution/delivery
`not-verified`. Host reload/trust may still be required.

For an explicit fresh-setup opt-out, append `-NoTelemetry` / `--no-telemetry` to
either installer or local bootstrap. Existing `enabled: false` remains byte-for-byte
unchanged on default reruns, including check mode. Environment and ancestor
opt-outs continue to win at runtime. Existing preferences must be a JSON object
containing only the boolean `enabled` field; malformed/unsupported files stop
before writes rather than being replaced. An explicit disable request against an
existing enabled preference also stops for review instead of overwriting it.

Existing differing hook/settings files stop the entire apply before writes.
This dependency-light route does not merge unrelated Claude settings, Codex
hooks, or edited Copilot hooks. Preserve and reconcile those files in a reviewed
merge, rather than deleting them or running the full workspace installer on top.

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
JSON error when requested. The report's `skills` list identifies the selected
skill names without another agent discovery pass. `toolsDetected.node` is an
optional hook-runtime inventory, not a new bootstrap prerequisite.

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

Run these one-liners in the intended app directory (Copilot shown):

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.ps1'))) -Agent copilot
```

```sh
(set -eu; installer=$(mktemp); trap 'rm -f "$installer"' EXIT; curl -fsSL --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.sh' -o "$installer"; sh "$installer" --agent copilot)
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
template (`v1.0.3`) and six-skill inventory/revision. The builder reads the
canonical `plugin/skills`, checks every file against `skills.lock.json`, and
retains the upstream MIT license. It does not fetch another author's skill copy.
`.hosted-skills-template.json` preserves the app's original provenance.
The separate `.hosted-skills-skills.json` records the skill snapshot's source,
names, adaptations, and installed byte baselines independently of the template.
The canonical plugin lock is neither copied to the app nor changed by bootstrap.

All cached skills match the canonical distribution except for a small, explicit
bootstrap-layout handoff in `skills-update` and its bundled reference. It updates
skills from a reviewed published starter cache only, without reapplying the app
or changing the installed telemetry/MCP configuration. Arbitrary uncached upstream revisions require
a separately reviewed cache refresh, not a silent fallback to another source.

`cache/files.tsv` is the shared apply contract: scope, SHA-256, source path and
destination path. Both OS entrypoints verify selected bytes before applying.
The mutually exclusive `preference-on`/`preference-off` scopes select the default
telemetry preference; an existing supported preference is preserved, not compared
against the default's hash. All runtime and hook files retain strict byte checks.
`.gitattributes` preserves cached bytes across checkouts. Future scenario-neutral
template packages can use the same contract with an external resolver. V1 uses
`repository-cache` explicitly; a separate remote template resolver is not yet
implemented. Latest-main resolution updates the starter distribution, not the
upstream template or skill pins within its reviewed cache.

Maintainers can run `python scripts/build-cache.py --refresh-skills` to refresh
only the reviewed skill snapshot, locked telemetry assets, and generated
instructions **offline**. This
preserves every existing app-cache byte, including its template provenance,
and stops on cache drift, source/lock mismatches, inventory changes, or links.
Review inventory/revision changes in `scripts/cache-sources.json` explicitly.
Do not edit hashes to conceal drift. Bootstrap end users still need no Python.

For a complete template refresh, maintainers can move the existing cache aside and run
`python scripts/build-cache.py` to generate a reviewed replacement from pinned
sources. The builder refuses to replace an existing cache. Never cache secrets.

Run bootstrap contracts with `python -m unittest discover -s tests -v`.
Python is maintenance/test tooling only. The tests exercise available POSIX,
PowerShell 7, and Windows PowerShell engines; require particular engines with
`BOOTSTRAP_ENGINES=sh,pwsh,powershell` and optionally `BOOTSTRAP_SH`.
GitHub Actions runs once per pull request update and on pushes to `main`, across
Windows, macOS and Linux. Tests cover layouts, exact bytes,
reruns, conflicts, corruption, traversal, links, and offline-mocked installation.
