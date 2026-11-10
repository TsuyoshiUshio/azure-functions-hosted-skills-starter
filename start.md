# Set up Azure Functions Hosted Skills

Use the same remote one-liner as README Method 2 to apply the cached application
template and all six repository skills in the current directory. Let the installer do
the work; do not reconstruct its steps with agent tools.

Only when the user explicitly requests **workspace setup without an app
template**, or recovery for `setup.ps1` / `setup.sh`, follow
[the workspace integration route](docs/setup.md#agent-led-workspace-integration)
instead. Do not combine the two routes or duplicate an enabled installation.
Do not bootstrap this distribution merely to maintain it.

## Select once, run once

Use the execution context already supplied by the coding agent to identify:

- **OS:** Windows, macOS, or Linux. Windows uses the PowerShell one-liner;
  macOS and Linux share the POSIX one-liner. In WSL or a remote session, use
  the execution host, not the desktop OS.
- **Agent:** GitHub Copilot (CLI or VS Code) = `copilot`, Claude Code = `claude`,
  Codex = `codex`. Substitute only that slug in the command below; never use
  `all` unless explicitly requested.
- **Target:** the intended current app directory. Do not create a nested project.
  Add `-Destination` / `--destination` only for an explicitly selected other path.

Do not ask the user to confirm information already known. If the OS is genuinely
unknown, use one native OS query, not separate tool/version probes. If the agent
or target is genuinely ambiguous, ask one focused question rather than guessing.

Briefly state the selected agent, OS, target, and that the cached sample and
instructions will be applied without overwriting conflicting files. Honor the
host's execution/download permissions. The setup request authorizes this
bootstrap, not tool installation, authentication, local runs, or deployment.
Fresh setup enables the selected host's telemetry hooks without a choice question.
Preserve opt-outs. Only for an explicit disable request, add `-NoTelemetry` /
`--no-telemetry` to the same installer command; do not add another setup step.

Run exactly one matching command with JSON output (Copilot shown). Do not first
clone the repository, inspect skills/locks/blueprints, query MCP, run a separate
prerequisite scan, or manually copy files. Do not invoke another plugin's
same-named Hosted Skills skill to perform setup.

**Windows (PowerShell)**

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.ps1'))) -Agent copilot -Json
```

**macOS / Linux (POSIX shell)**

```sh
(set -eu; installer=$(mktemp); trap 'rm -f "$installer"' EXIT; curl -fsSL --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/install.sh' -o "$installer"; sh "$installer" --agent copilot --json)
```

Default to latest main; the installer resolves it once to an immutable SHA.
For an explicitly requested pinned version, use that full SHA in both the
download URL and `-Ref` / `--ref`. Never silently replace a failed source.
The installer owns download staging, hash verification, conflict preflight,
application, prerequisite inventory, provenance, and temporary-file cleanup.

## Read the result and hand off

Use the exit code and JSON from that execution, not another inspection loop.
On a nonzero exit, invalid/missing JSON, or `authorReady` other than `true`,
report the actual failure and stop. Read stderr too: download and shell errors
may not return JSON. Preserve existing files; do not force, choose a different
target, retry automatically, or switch to manual installation. A missing OS
utility gets its OS-specific installation guidance, not an automatic install.

On success, confirm `destination`, `agent`, and `starterSource` match the
selected target/agent/source, allowing OS path aliases for the same directory.
The `skills` list reports the selected six skills, including their references
and assets; no second installation or discovery scan is needed.
Read `toolsDetected` to give only relevant missing
prerequisite guidance in the same response:

| Report | Guidance when absent |
| --- | --- |
| Both `python3` and `python` are false | For local Python execution, link to [Python installation](https://www.python.org/downloads/) for the selected OS. Either command being detected is sufficient for this inventory. |
| `func` is false | For local execution, link to [Azure Functions Core Tools installation](https://learn.microsoft.com/azure/azure-functions/functions-run-local#install-the-azure-functions-core-tools). |
| `azurite` is false | For local Storage emulation, link to [Azurite options](https://learn.microsoft.com/azure/storage/common/storage-use-azurite). CLI absence does not rule out an existing container or another configured Storage endpoint. |
| `azd` or `az` is false | Mention only for deployment preparation: [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) / [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli). Do not block authoring. |
| `node` is false | Telemetry hooks are installed but inactive until Node.js 22.13+ is available to the agent. Bootstrap and authoring are not blocked. |

These are command-presence checks, not version, service, credential, or model
validation. Do not run follow-up probes during setup or claim Local-run-ready
or Deploy-ready: `localRun` and `deployment` remain `not-verified`.
Missing optional tools do not undo Author-ready. Give installation guidance,
but do not install Node or other tools automatically. No dependencies, hosts,
containers, sign-ins, Connector consent, commits, or publication are authorized.
The bootstrap adds no MCP. `telemetry` reports the local preference, not verified
hook execution or delivery; ancestor/environment opt-outs still take precedence.
Do not open azure-functions-hosted-skills-canvas unless the user explicitly asks.

Finish immediately in the user's language with **Hosted Skills setup complete!**,
the selected agent/destination and recorded source SHA, and any missing-tool
guidance. If no relevant tools are missing, go straight to the intent question.
Mention a reload only if the host needs it. The v1 template is the official
daily-blog sample; adapt/remove sample behavior before running or deploying.

## Ask what to build, then hand off

In the same response, ask one question: what the user wants to build with
Hosted Skills. Offer this example as inspiration, not as a default to execute:

> Use azure-functions-hosted-skills to create a weekly Microsoft AI briefing.
> Every Monday at 08:00 JST, summarize Microsoft AI news from the past seven days
> using official Microsoft sources, include source links, and post it to an
> existing Teams thread. Show a plan first; do not deploy or send messages yet.

Do not ask further setup questions or start customization before the answer.
When the user answers, setup is over: read the generated `AGENTS.md` and the
installed local `azure-functions-hosted-skills` skill, not another plugin's
same-named skill, and let that skill own planning, clarifying questions,
approvals, and implementation. Do not reimplement its workflow from this file.
Migration, the three Connector lifecycle skills, and `skills-update` are installed
alongside the authoring skill. Migration still requires an explicit use request
by name; listing or installing it does not authorize running it.
