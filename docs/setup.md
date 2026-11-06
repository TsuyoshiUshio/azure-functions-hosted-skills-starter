# Setup options

**Recommended:** give your coding agent
<https://aka.ms/hosted-skills-starter>.
It can set up a new or existing workspace even without Node.js, and review
merges with you. For local review, give it this checkout's `start.md`.

## One-line terminal setup

These optional launchers use **Node.js 22.13+, npx, and Git**. If any is missing,
they show the agent setup prompt instead of installing tools or partially
configuring your workspace. That handoff exits with code `2`; no setup ran.

Review the launcher before executing downloaded code. It stages the official
distribution, shows a preview, asks before applying, and removes its staging
on success, cancellation, or error. It never deploys to Azure.

**PowerShell**

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Azure-Samples/azure-functions-hosted-skills-starter/main/setup.ps1))) -Agent copilot
```

**Bash**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Azure-Samples/azure-functions-hosted-skills-starter/main/setup.sh) --agent copilot
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

An enabled plugin already supplies its own skills and hooks. Do not add a
duplicate workspace install. Plugin manager commands are in the [README](../README.md).

## After setup

Reload your agent if requested and review its workspace, hook, and MCP trust
prompts. Setup is not permission to approve them or to deploy.
Missing optional Node-based MCP or telemetry is reported as deferred; it does
not prevent authoring with the installed skills.

The [README examples](../README.md#getting-started) show prompts for a Monday
Microsoft AI briefing in Teams and migration of a GitHub Actions release digest.

For configuration locations, provenance, updating, and telemetry implementation,
see the [maintainer guide](development.md).
