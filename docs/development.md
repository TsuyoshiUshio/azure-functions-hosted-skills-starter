# Maintainer and architecture guide

The [README](../README.md) is the customer entry point. Keep implementation
details here, and keep the agent-led contract in [start.md](../start.md) and
[agent-setup.md](agent-setup.md). Node is optional for agent-led onboarding;
the deterministic installer and synchronization tooling need Node.js 22.13+.
There are no npm dependencies to install.

## Distribution and workspace assets

Canonical skills live in `plugin/skills`, not in multiple auto-discovered roots.
The subset contains:

| Skill | Purpose |
| --- | --- |
| `azure-functions-hosted-skills` | Author, extend, run, and deploy under approval |
| `azure-functions-hosted-skills-migrate` | Explicitly requested migration |
| `azure-functions-connector-create` | Connection, identity, and consent |
| `azure-functions-connector-mcp` | Metadata-derived schemas and MCP registration |
| `azure-functions-connector-validate` | Contract and downstream side-effect checks |
| `skills-update` | Preview latest or SHA-pinned skill updates |

The three Connector skills are required dependencies. The full upstream plugin,
application template, Dev Container, and Codespaces environment are not bundled.
The upstream MIT license accompanies the plugin and installed workspace.

`scripts/host-config.mjs` renders native plugin manifests and inactive
`assets/setup/<agent>` workspace blueprints from the same definitions.
`assets/workspace-instructions.md` supplies the shared instruction contribution.
Agent-led setup can read these locked assets without executing JavaScript.

| Host | Skills | MCP | Hooks / instructions |
| --- | --- | --- | --- |
| Claude Code | `.claude/skills` | `.mcp.json` | `.claude/settings.json`, owned `CLAUDE.md` block |
| Codex CLI | `.agents/skills` | `.codex/config.toml` | `.codex/hooks.json`, owned `AGENTS.md` block |
| Copilot CLI | `.github/skills` | `.mcp.json` | `.github/hooks/hosted-skills-starter.json`, owned `AGENTS.md` block and scoped entry point |
| VS Code, Copilot harness | `.github/skills` | `.vscode/mcp.json` | Same Copilot hook/instruction paths |

Runtime, license, opt-out, and installation state live under
`.hosted-skills-starter`. The application gets only its selected host's files,
not the distribution's tests, source tools, inactive blueprints, or package files.
Native plugin installation instead uses Claude's `.claude-plugin/plugin.json`,
Codex's `.codex-plugin/plugin.json`, and Copilot's `plugin.json`.
Root marketplace catalogs target the same `plugin` directory. Do not patch host
plugin caches or combine duplicate plugin/workspace hooks.
Plugin packages also include `AGENTS.md` and `CLAUDE.md` as local guidance.
Do not assume every plugin manager automatically loads those files or copies
them into the user's project. Reviewed workspace setup installs the host-native
instruction contribution; native plugin installation does not silently edit
project instructions.

Workspace guidance selects only this starter's local skills by default, including
Hosted Skills validation, deployment, verification, and troubleshooting. This
boundary applies to differently named skills as well as same-named external
plugins and user/global skills. External skills require an explicit user request
identifying the skill and source for the current task; ambiguous sources need
clarification. Generic deployment requests and skill references/handoffs do not
authorize a switch, and an override does not become a lasting default. Missing
local capabilities must be reported rather than silently routed elsewhere.
Built-in tools, CLI commands, and compatible reused Azure MCP remain available
within the approved action scope. This is a skill-selection policy, not a plugin
uninstall, permissions change, or technical sandbox.

Canvas opens only on an explicit request, never just because the user mentions
Hosted Skills, a timer, or an agent. The entry prompt also identifies setup as
configuration. Documents cannot force a host's routing before it reads them;
native host enforcement and actual agent routing need separate verification.

## Installer and merge behavior

`setup.ps1` / `setup.sh` are customer-facing wrappers around `scripts/setup.mjs`.
They check Node/npx/Git before staging, preserve the resolved source through
preview/apply, request approval, and clean only their owned staging.
Missing prerequisites hand off to agent setup; they are not installed silently.

The Node installer previews by default. Apply requires the exact plan token,
binding the destination state and proposed assets. It preserves unrelated
JSON fields, MCP servers, and hooks; root instruction files and Codex TOML use
owned marker blocks. Updates remove the former managed Claude rule file only
when unchanged; local edits require a reviewed merge.
Conflicting definitions, edited owned blocks, malformed JSON, unknown TOML
structures, symlinks, stale plans, and concurrent edits stop before replacement.
The dependency-free TOML adapter is not a full grammar validator.

For reviewed merges outside those bounds, use the agent-led recipe, not a force
flag or changed hashes. Preserve JSONC comments and user intent. Record the
actual installed hashes and ownership metadata. Agent mode can defer a
Node-dependent MCP server rather than registering a broken command; telemetry
hooks remain safely inactive. Adding Node later is separate work.

One host is selected per workspace installation. Switching hosts requires a
reviewed migration. Host trust/reload and real native execution are separate
from static file validation; initial support targets local sessions, not cloud.

## Versions and synchronization

`skills.lock.json` records the upstream `Azure/azure-functions-skills` commit,
version, raw source hashes, generated asset hashes, and content policy.
The skills SHA, starter tooling revision, application template ref, Python runtime,
and MCP package version are independent. Unpublished local source records a
null starter revision, never a fictional published commit.

Ask the agent to use `skills-update`, or run from the distribution root:

```shell
node scripts/update-skills.mjs --ref latest
node scripts/update-skills.mjs --apply --ref <approved-full-SHA> --expect-current <current-lock-SHA>
node scripts/update-skills.mjs --check
```

Preview first and approve the resolved exact SHA. Synchronization fetches only
the five allowlisted skills, their references/assets, license, reviewed public
ingestion metadata and ARM observation helper. TypeScript stripping uses Node's
built-in functionality. No upstream build script, SDK bundle, dependency install,
or Dev Container is executed/copied. New dependencies or changed collection
contracts require review.

Raw source hashes are distinct from starter-adapted hashes. The local updater
skill and tooling are maintained here, not fetched from upstream. Upgrade
tooling separately from skill refreshes. Preserve local edits when upstream
content is unchanged; stop on conflicts; delete obsolete files only if their
hashes match. Writes are guarded and roll back where concurrent changes permit.
Never infer permission to commit, publish, upgrade runtimes, or deploy.

## MCP and generated applications

`starter.config.json` pins development-time Azure MCP:
`npx -y @azure/mcp@4.0.0-beta.6 server start`. First use can download into the npm
cache after host approval. Its child-process environment disables Azure MCP's
own telemetry. A configured privileged tool is not authorization to call it.
Do not install credentials or change global agent settings.
Agent-led setup can reuse a compatible working host-provided MCP without adding
a workspace registration. Record the verified capability and reuse scope, not
credentials. This does not imply the workspace carries portable MCP settings,
or that Azure authentication and all downstream operations have been verified.

The authoring skill retrieves `ai-hosted-skills-python` from the live
[Functions template manifest](https://cdn.functions.azure.com/public/templates-manifest/manifest.json),
using Azure MCP or the manifest's GitHub repository/folder/exact `gitRef`.
The current app is
[functions-daily-blog-hosted-skills-azd](https://github.com/Azure-Samples/functions-daily-blog-hosted-skills-azd),
including Bicep and azd configuration. Stage first, preserve the user's files,
exclude `.devcontainer`, remove unused sample resources, and record template SHA.

App-local MCP uses approved remote HTTP endpoints in `src/mcp.json`, not this
development-time stdio configuration. Running an app additionally needs compatible
Python (currently 3.13 in the scaffold), Functions Core Tools v4, and workflow-
dependent Azure CLI, azd, emulators, model access, and Azure resources. Check and
approve those separately. Local execution can incur model or connector costs.

## Telemetry implementation

Default-on, best-effort collection uses Node standard HTTPS APIs and the same
public Application Insights ingestion destination as upstream. No SDK, persistent
device/user ID, or telemetry npm package is shipped. Each `EventData` has fixed
`distribution=hosted-skills-starter`; it cannot be overridden by hook input.
Do not ask a telemetry-choice question during setup. Preserve existing opt-outs
and honor explicit opt-out requests; the README explains how to opt out.

Events are `HostedSkillsStarterSetup` (successful changed scripted setup),
`AzureFunctionsSkillsPluginExecuted` (selected skill/tool/file categories), and
`azure_deployment_observed` (approved successful deploy/provision observation).
Agent-led no-Node setup does not invent an equivalent event or delivery.

No prompts, raw arguments, contents, absolute paths, environment names, resource/
subscription IDs, or session IDs are transmitted. Deployment environment names
are used locally for bounded read-only ARM queries in the existing CLI context.
Opt-out is checked before querying. No authentication, account switching, write,
retry, or user-facing failure occurs for telemetry. Child processes, stdin,
network delivery and ARM traversal are bounded; failure cannot change a user
operation's outcome.

Opt-out: `--no-telemetry`, workspace
`.hosted-skills-starter/telemetry.config.json` with `enabled: false`, or
`HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY=false`. The runtime also honors
`AZURE_FUNCTIONS_SKILLS_COLLECT_TELEMETRY=false`, `AZURE_MCP_COLLECT_TELEMETRY=false`
in the agent environment, and upstream-style hook opt-out files.
An ancestor opt-out wins; malformed/unreadable preferences fail closed.
These settings do not control the coding agent's own telemetry.

Generated application Insights traces and `azurefunctions-agents-runtime[monitor]`
belong to the app owner, separate from adoption tracking. Sensitive content
recording stays off unless approved.

Maintainers with push access can read GitHub Insights > Traffic or
`gh api "repos/OWNER/REPO/traffic/clones?per=day"` for the last 14 days of full
clones and unique cloners. This is not active-user/template adoption counting.
Longer history needs a separate collector; do not sum overlapping windows.

## Validation and publication

```shell
node --test
node scripts/update-skills.mjs --check
```

Tests use offline fixtures and injected transports, not production telemetry,
models or Azure provisioning. Keep managed text LF-normalized so Git checkouts
preserve the recorded byte hashes. Native host tests must use isolated state,
not global installs or trust bypasses.
Keep local environment variants, agent credentials/transcripts, and Azurite
databases/payloads out of Git. The ignore rules retain placeholder environment
examples, shared host adapters, installation provenance, and all locked assets.

During testing, the distribution source is
`TsuyoshiUshio/azure-functions-hosted-skills-starter`, not the upstream skills
repository or the separately hosted app template. Before production, confirm
the approved owner/repository/default branch rather than assuming Azure-Samples.
Track the source, catalogs, raw URLs, tests, and existing-installation cutover in
[the production migration issue](https://github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/issues/1).

Before release, publish all referenced files and plugin catalogs. Keep
`https://aka.ms/hosted-skills-starter` pointed at
`https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main/start.md`
during testing, then update it to the approved production location.
The short URL does not need a file extension: its destination serves the raw
Markdown prompt. Recheck the redirect, raw/fallback URLs, and both onboarding
paths. Keep the supplied original banner in `docs/images`.
