# Agent-led setup reference

Use this recipe only for explicitly requested no-template workspace integration,
when Node is unavailable or an existing file needs a reviewed merge beyond the
deterministic workspace installer's supported formats.
It is the same setup contract, not an instruction to install Node.
Read this file from the exact distribution snapshot selected by
[docs/setup.md](setup.md#agent-led-workspace-integration), not during the default
one-liner bootstrap in `start.md`.

## Source and destinations

Use `skills.lock.json` as the inventory and SHA-256 integrity record.
Verify the selected source assets with available native tools such as
PowerShell `Get-FileHash`, `sha256sum`, or `shasum -a 256`. These do not need Node.
If source verification fails, resolve that failure before writing; never
replace hashes merely to suppress a mismatch.

| Host | Copy the contents of `plugin/skills` into | Merge the blueprint from |
| --- | --- | --- |
| Claude Code | `.claude/skills` | `assets/setup/claude` |
| Codex CLI | `.agents/skills` | `assets/setup/codex` |
| Copilot CLI | `.github/skills` | `assets/setup/copilot` |
| Copilot in VS Code, Copilot harness | `.github/skills` | `assets/setup/vscode` |

Copy all six skill folders and their complete references/assets, not just
`SKILL.md`. Do not copy plugin manifests, inactive host blueprints, maintainer
scripts, or an app template into the workspace.

Copy the contents of `plugin/hooks/runtime` to `.hosted-skills-starter`.
Copy `plugin/upstream-LICENSE` there as `upstream-LICENSE`.
Create `.hosted-skills-starter/telemetry.config.json` with `enabled: true`
only if no preference already exists. Do not ask a telemetry-choice question.
Use `enabled: false` only for an existing opt-out or an explicit user request.
Retain an ancestor or environment opt-out. Malformed preference files require
an approved repair; they are not permission to re-enable collection.
Do not manufacture a setup telemetry event or invent a non-Node sender.

The host blueprints contain the **workspace** commands, including safe failure
handling and relative runtime discovery. Reuse these exact hook entries rather
than copying plugin-root commands or synthesizing a new shell launcher.
Node may be absent: these hooks then do nothing and return success.

The selected host's locked blueprints render `assets/workspace-instructions.md`
with its actual local skill root. Install their instruction contributions:

- Claude: an owned block in `CLAUDE.md`.
- Codex and Copilot/VS Code: an owned block in `AGENTS.md`.
- Copilot/VS Code: `.github/instructions/hosted-skills-starter.instructions.md`,
  with standard frontmatter, pointing to the root `AGENTS.md` contribution.

Use `# BEGIN hosted-skills-starter` and `# END hosted-skills-starter` markers.
Merge blocks into existing files, not over them. Read the local `SKILL.md` paths
from this guidance instead of invoking another plugin's same-named skills.
Canvas is separate and opens only when the user explicitly asks to open it.

## Merge existing files, do not reset them

Inventory each destination before planning. Classify it as missing, identical,
compatible existing configuration, or a genuine conflict. Show a minimal diff
and obtain approval for changed files, including intentional replacements.

For JSON/JSONC, add only the Azure server and the starter's hook entries.
Keep unrelated keys, comments, servers, permissions, and hooks. Do not parse
JSONC with a lossy JSON-only rewrite. A compatible existing Azure server can be
reused. If its behavior differs, explain the choice before changing it.

For Codex TOML, preserve unrelated sections and comments. The MCP blueprint
already includes the owned marker block; insert or merge it without creating
duplicate Azure tables or keys. Never concatenate a second Azure definition.
For Claude/Codex hooks, append or update only the starter group inside
`PostToolUse`. For Copilot, merge only the starter hook file. Never add duplicate
entries on repeat setup.

For instructions, keep the user's content and add or merge the owned contribution.
If the existing starter block or a skill has local edits, compare them against
the selected source and preserve that intent in the proposed merge. A script
conflict is a request for agent-assisted review, not a reason to delete the file,
reset the lock, or abandon all setup.

Recheck destination versions/hashes immediately before editing. On a concurrent
change, reconcile and review again. Use reversible edits or private recovery
backups for approved replacements. If an operation fails, safely restore this
setup's writes where no later user change would be lost; otherwise preserve and
report the unresolved artifacts. Never print secrets in diffs or logs.

## Optional Node-dependent integrations

The MCP blueprints use the pinned npx command from `starter.config.json`.
First check for a compatible working server already provided by the host or
workspace. Reuse it without another registration, even when Node is available.
Record the verified capability and whether reuse is host-scoped or workspace-
configured; do not copy credentials. Omit the new MCP blueprint on this agent-led
route, not by patching the installer's source or mutating its generated plan.
If Node/npx cannot run, leave the user's working servers alone and **do not add
an active, unusable npx server**. Reuse a compatible existing Azure MCP service
if available, or record Azure MCP as deferred. The authoring skill can retrieve
the official template through its manifest/GitHub fallback.

Copying the small telemetry runtime is harmless without Node; the guarded hook
does not install anything. Mark telemetry inactive, not delivered or verified.
Do not change the user's opt-out. Installing Node, registering a new service,
or resolving authentication is separate approved work, not a setup requirement.

## Record provenance for later updates

Write `.hosted-skills-starter/install.json` after successful file changes.
Use the deterministic installer's schema so later updates can recognize the
installation:

- `schemaVersion`: `1`; `upstream`, `commit`, and `upstreamVersion`: copy from
  the distribution's skills lock.
- `agent`: the selected host; `starterRevision`: the selected published starter
  SHA, or `null` for an unpublished local snapshot; `mode`: `agent`.
- `files`: relative managed paths mapped to SHA-256 baselines. For copied assets
  and approved merged configurations, hash the installed bytes. For intentionally
  preserved local skill edits, retain the previous source baseline (or the
  selected source hash on first adoption), not the edited bytes: this lets later
  updates recognize them as local edits. Record their actual hashes separately
  in `preservedHashes`, rather than claiming they match the distribution.
- `mcp`: the public starter server definition owned by this setup, or `null` when
  deferred or reusing a different server. Record reuse in `reused`; never copy
  credentials or unrelated server definitions into this record.
- `hook`: for Claude/Codex, the starter group from the blueprint; `blocks`: hashes
  of owned Codex TOML and AGENTS/CLAUDE marker blocks, including the markers but
  excluding their trailing newline. This distinguishes local edits on updates.
- `deferred`: optional integrations not yet available, such as `azure-mcp` or
  `telemetry-runtime`; `preserved`: any deliberately retained local skill edits.

Hashes must reflect real bytes, not invented placeholders. Keep raw source
hashes distinct from approved merged-file hashes. If no reliable verification
tool is available, state what remains unverified rather than claiming the DoD.

## Verification, cleanup, and celebration

Use the Definition of done in `docs/setup.md`. Parse configuration with an available
native parser where possible, inspect skill names and relative references, and
check each copied asset against the inventory. Verify that only one starter
hook contributes to each event and that repeat setup does not add duplicates.
Do not equate static inspection with a running MCP server or native hook test.

Remove only temporary staging, archives, and redundant recovery files created
by this setup. Never remove a supplied source checkout, installed runtime/state,
or unrelated user data. Keep and report backups still needed for recovery.

Finish in the user's language with the prominent completion message and both
creation and migration prompts from `README.md`. Distinguish skills ready for
authoring from optional deferred MCP/telemetry, and from pending reload/trust.
Report a reused MCP separately; do not imply its configuration is portable to
another host when it is provided only by the current host.
