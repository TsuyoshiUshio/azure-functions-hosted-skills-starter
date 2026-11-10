# Azure Functions Hosted Skills Starter

![Azure Functions connected to skills and services in the cloud](docs/images/hosted-skills-banner.png)

Turn an idea, automation, or existing skill into an event-driven AI capability on Azure Functions, with your coding agent.

Works with **GitHub Copilot, Claude Code, and Codex**.

## Getting started

### Method 1: Ask your agent with start.md (Recommended)

Paste this into your coding agent:

```text
Read https://aka.ms/hosted-skills-starter and set up
Azure Functions Hosted Skills in this workspace.
This is workspace setup, not app creation. Do not open a Canvas.
```

Your agent reviews existing files and sets up only what it needs.
**Node.js is optional for agent-led setup.** Nothing is deployed to Azure.

Then build a weekly AI briefing:
> Use azure-functions-hosted-skills to create a weekly Microsoft AI briefing.
> Every Monday at 08:00 JST, summarize Microsoft AI news from the past seven days
> using official Microsoft sources, include source links, and post it to an
> existing Teams thread. Show a plan first; do not deploy or send messages yet.

Or migrate an existing automation (example):
> Use azure-functions-hosted-skills-migrate to migrate my GitHub Actions workflow
> at `.github/workflows/weekly-releases.yml`: every Friday at 09:00 JST, it reads
> new GitHub releases and posts a Teams digest. Preserve its repository list,
> schedule, and destination. Show a migration plan; do not deploy or send messages yet.

### Method 2: Run a one-liner

Create a **new app with its template applied**, without Node or development MCP.
Choose your agent and OS. Commands use **latest main** and create `my-hosted-skill`.
Open it in your agent. No tools are installed; nothing is deployed.

<details>
<summary>GitHub Copilot</summary>

**Windows (PowerShell)**

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.ps1'))) -Destination .\my-hosted-skill -Agent copilot
```

**macOS / Linux**

```sh
(set -eu; installer=$(mktemp); trap 'rm -f "$installer"' EXIT; curl -fsSL --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.sh' -o "$installer"; sh "$installer" --destination ./my-hosted-skill --agent copilot)
```

</details>

<details>
<summary>Claude Code</summary>

**Windows (PowerShell)**

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.ps1'))) -Destination .\my-hosted-skill -Agent claude
```

**macOS / Linux**

```sh
(set -eu; installer=$(mktemp); trap 'rm -f "$installer"' EXIT; curl -fsSL --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.sh' -o "$installer"; sh "$installer" --destination ./my-hosted-skill --agent claude)
```

</details>

<details>
<summary>Codex</summary>

**Windows (PowerShell)**

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.ps1'))) -Destination .\my-hosted-skill -Agent codex
```

**macOS / Linux**

```sh
(set -eu; installer=$(mktemp); trap 'rm -f "$installer"' EXIT; curl -fsSL --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.sh' -o "$installer"; sh "$installer" --destination ./my-hosted-skill --agent codex)
```

</details>

These commands execute downloaded code. See [bootstrap details](docs/bootstrap.md)
for SHA pinning, checks, prerequisites, and sample limitations.
For pre-merge testing, use the [PR trial commands](https://github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/pull/4).
For an **existing workspace without app creation**, use Method 1 or the
[reviewed workspace setup scripts](docs/setup.md#one-line-terminal-setup).
Use one setup method per workspace.

### Method 3: Install a plugin

Choose your agent. Use either plugin installation or workspace setup, not both.

<sub>This starter bundles the Hosted Skills-related subset of
[azure-functions-skills](https://github.com/Azure/azure-functions-skills).
If you already have that plugin installed, you can use its Hosted Skills authoring and migration features without installing this subset again.</sub>

<details>
<summary>GitHub Copilot CLI</summary>

```shell
copilot plugin install TsuyoshiUshio/azure-functions-hosted-skills-starter:plugin
```

</details>

<details>
<summary>Claude Code</summary>

```text
/plugin marketplace add TsuyoshiUshio/azure-functions-hosted-skills-starter
/plugin install hosted-skills-starter@hosted-skills-starter
```

</details>

<details>
<summary>Codex CLI</summary>

```shell
codex plugin marketplace add TsuyoshiUshio/azure-functions-hosted-skills-starter
codex plugin add hosted-skills-starter@hosted-skills-starter
```

</details>

## Developer guide

For contributions, architecture, and skill updates, see the [developer guide](docs/development.md).

<details>
<summary>Disable telemetry</summary>

Tell your agent: **Set up Hosted Skills with telemetry disabled.**

For an existing installation, set `enabled` to `false` in
`.hosted-skills-starter/telemetry.config.json`, or set
`HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY=false` before starting your agent.

</details>

## Special thanks

Thanks to [shibayan](https://github.com/shibayan) for the inspiration and for sharing
the [original starter](https://github.com/shibayan/azure-functions-hosted-skills-starter).
