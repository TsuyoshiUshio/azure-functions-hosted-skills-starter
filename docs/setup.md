# Workspace integration without an app template

The default [start.md](../start.md) flow uses the cached-template one-liner.
Use this separate route only for an explicitly requested **workspace setup
without app creation**, or recovery for `setup.ps1` / `setup.sh`. It installs
the six-skill integration and selected host configuration, not an app template.
Do not install both routes in one workspace.

For agent-led setup, ask your agent to follow this document's
[workspace integration instructions](#agent-led-workspace-integration).
Node is optional for that route; existing files require reviewed merges.

## One-line terminal setup

These optional launchers use **Node.js 22.13+, npx, and Git**. If any is missing,
they show the agent setup prompt instead of installing tools or partially
configuring your workspace. That handoff exits with code `2`; no setup ran.

Review the launcher before executing downloaded code. It stages the current
distribution, shows a preview, asks before applying, and removes its staging
on success, cancellation, or error. It never deploys to Azure.

**PowerShell**

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/setup.ps1))) -Agent copilot
```

**Bash**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/setup.sh) --agent copilot
```

Choose `claude`, `codex`, `copilot`, or `vscode`. The current directory is the
workspace; select another with `-Workspace` (PowerShell) or `--workspace` (Bash).
Add `-NoTelemetry` / `--no-telemetry` to opt out. Use `-Preview` / `--preview`
to inspect without applying. Neither launcher has a force or unattended-approval
flag. Conflicts can be handed back to your agent for a reviewed merge.

From a local distribution checkout, the equivalent one-liners are
`.\setup.ps1 -Agent copilot` or `bash setup.sh --agent copilot`.
For an explicit local source, use `-Source` / `--source`; that checkout is never
deleted. Downloaded source is held at its resolved SHA through preview/apply.

## Existing files

Setup preserves unrelated configuration and your telemetry preference.
When the scripted path cannot reconcile edited skills, comments, complex TOML,
or an existing Azure server, use the agent-led route below: it can inspect
the conflict, show a merge or replacement, and obtain your approval.

An enabled native plugin installation of this starter already supplies its own
skills and hooks; do not duplicate it with a workspace install. A different
Azure Functions plugin is not an installation of this starter and does not
replace an explicitly requested local setup. Do not disable other plugins.
Plugin manager commands are in the [README](../README.md).

## After setup

Reload your agent if requested and review its workspace, hook, and MCP trust
prompts. Setup is not permission to approve them or to deploy.
Claude uses an owned `CLAUDE.md` block; Codex and Copilot use an owned `AGENTS.md`
block, with a scoped Copilot instruction pointing to it. Existing instructions
are preserved. The guidance selects local skills rather than another plugin's
same-named skills and opens Canvas only on an explicit request.
Missing optional Node-based MCP or telemetry is reported as deferred; it does
not prevent authoring with the installed skills.
An already working compatible Azure MCP can be reused without adding another
registration. The completion report distinguishes reuse from workspace
configuration and deferred integrations.

The [README examples](../README.md#getting-started) show prompts for a Monday
Microsoft AI briefing in Teams and migration of a GitHub Actions release digest.

For configuration locations, provenance, updating, and telemetry implementation,
see the [maintainer guide](development.md).

## Agent-led workspace integration

This is the explicit no-template path, not the default bootstrap. Do not invoke
an app-authoring skill or open Canvas for configuration.

Identify the actual host: `claude`, `codex`, `copilot` (CLI), or `vscode`
(Copilot harness). Use the intended existing workspace, not a nested project.
Read its instructions, skills, hooks, MCP configuration and installation record.
Reuse an enabled installation of this starter instead of duplicating it.

Use the supplied distribution for local review. Otherwise resolve and stage a
specific commit of `TsuyoshiUshio/azure-functions-hosted-skills-starter` outside
the target workspace, with Git or the agent's HTTP tools. Keep that same
revision through review and application; never claim unpublished files exist
at a published SHA.

Read `docs/agent-setup.md`, `skills.lock.json`, and the selected host's locked
`assets/setup` blueprints. If Node.js 22.13+ and the script prerequisites are
available, use `scripts/setup.mjs` to preview. Apply only the approved
`--expect-plan` token. Otherwise continue with agent-led setup from the locked
blueprints; do not install Node or other tools automatically.

Inspect conflicts and show a minimal merge or intentional replacement. Reuse
compatible MCP servers; do not modify installer internals to omit MCP or mutate
its generated plan. Without runnable Node/npx or a compatible existing server,
record Azure MCP as deferred instead of adding a broken command. Preserve
unrelated settings, source, infrastructure, skills, and instructions.

Show the host, target, revision, proposed paths/merges and reused or deferred
integrations, then get approval. Recheck files before applying; re-preview stale
plans. Fresh telemetry defaults to enabled. Do not ask a telemetry-choice
question; preserve existing opt-outs and honor an explicit request to disable it.
Keep changes reversible and report incomplete operations accurately.

### Definition of done

- All six locked skills and complete references/assets are discoverable at the
  selected host's local skill root, without duplicate adapters or hooks.
- Native CLAUDE/AGENTS instructions name the local skills, prefer them over
  same-named external plugins, and open Canvas only on explicit request.
  Preserve user instructions; install Copilot's instruction entry point too.
- Retain the upstream license; record actual revision, hashes, owned blocks,
  preserved edits, and reused/deferred integrations in the installation record.
- Preserve existing app files, credentials, configuration and opt-outs unless a
  specific merge was approved. Host JSON/TOML, skill frontmatter, and relative
  references are valid; trust/reload and real runtime checks remain separate.
- Hooks are non-fatal without Node. MCP is runnable, reused, or deferred; do not
  claim a running server from static inspection.
- No distribution checkout, inactive host assets, maintenance tests,
  node_modules, or Dev Container remain in the workspace.
- Temporary downloads, archives, and owned staging are cleaned. Keep supplied
  checkouts, installed runtime/state, unrelated files and required recovery
  backups; report retained items.

Finish with **Hosted Skills setup complete!**, the selected host/local skill
root, any trust/reload steps, and reused or deferred integrations. Show the
[README creation and migration prompts](../README.md#getting-started), without
executing them. No authentication, local runs, Connector consent, application
generation, deployment, Git commit, push, or global tool installation is
authorized by workspace integration.
