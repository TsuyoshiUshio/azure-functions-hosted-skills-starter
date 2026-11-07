# Setup options

**Recommended:** give your coding agent
<https://aka.ms/hosted-skills-starter>.
It can set up a new or existing workspace even without Node.js, and review
merges with you. For local review, give it this checkout's `start.md`.

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
or an existing Azure server, use the recommended agent route: it can inspect
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
are preserved. The guidance uses this starter's local skills by default:
`azure-functions-hosted-skills` also owns deployment. External plugin and
user/global skills require an explicit user request identifying the skill and
source for the current task. A generic deployment request or a skill handoff
does not authorize that switch. Missing local capabilities are reported rather
than silently routed elsewhere. Built-in tools, CLI commands, and compatible
reused Azure MCP remain available within approved actions; other plugins are
not disabled. Canvas opens only on an explicit request.
Missing optional Node-based MCP or telemetry is reported as deferred; it does
not prevent authoring with the installed skills.
An already working compatible Azure MCP can be reused without adding another
registration. The completion report distinguishes reuse from workspace
configuration and deferred integrations.

The [README examples](../README.md#getting-started) show prompts for a Monday
Microsoft AI briefing in Teams and migration of a GitHub Actions release digest.

For configuration locations, provenance, updating, and telemetry implementation,
see the [maintainer guide](development.md).
