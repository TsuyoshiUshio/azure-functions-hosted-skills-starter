# Hosted Skills development

This project is already scaffolded. Do not fetch or reapply a template to begin
development. Read `.hosted-skills-template.json` for its pinned provenance.

Read local skills in `.agents/skills/` (Copilot/Codex) or `.claude/skills/`
(Claude Code), not another plugin's same-named skills:

- `azure-functions-hosted-skills`: authoring, runtime, triggers, and deployment.
- `azure-functions-hosted-skills-migrate`: migration only when explicitly
  requested by name, never automatically or merely quoted.
- `azure-functions-connector-create`: connection, identity, and consent.
- `azure-functions-connector-mcp`: operation schemas and MCP configuration.
- `azure-functions-connector-validate`: connection and side-effect validation.
- `skills-update`: explicit skills-only updates for this bootstrap layout.

`.hosted-skills-skills.json` records their source and byte baselines independently
of the template. The updater's bootstrap reference preserves this layout; do not
run the full workspace installer or reapply the app to update skills.
The authoring references contain runtime,
trigger, MCP, testing and infrastructure guidance. No development MCP server is
required to edit this project. Additional deployment skills mentioned upstream
are optional installations for that later workflow, not bootstrap prerequisites.
Do not open Canvas unless explicitly requested.

The v1 template intentionally retains the official daily-blog sample, including
a chat agent, a daily timer, dynamic sessions and optional Outlook infrastructure.
Before adapting it, understand the user's scenario. Remove or replace sample
agents that do not belong to it; do not retain a timer or chat endpoints merely
for testing. Keep local settings and infrastructure parameters consistent.

Bootstrap means Author-ready, not Local-run-ready or Deploy-ready. It has not
installed Python, Core Tools, Azurite or azd, verified their versions, authenticated,
provisioned resources, or validated a model connection. Check the relevant
prerequisites when the user requests that next step. Do not infer cloud access
from a tool being present on PATH.

Bootstrap installed the selected host's best-effort telemetry hooks and the
SDK-free collector in `.hosted-skills-starter`. Node.js 22.13+ is needed only for
hook execution; setup sent no telemetry. Preserve `telemetry.config.json` and
ancestor/environment opt-outs. Never add duplicate hooks, install Node, or send
test events merely to verify authoring readiness. App monitoring is separate;
keep sensitive content capture off.

Require separate user approval before tool installation, starting hosts or
containers, sending messages, provisioning Azure resources, or deploying.
Never commit `src/local.settings.json`, credentials or local environment state.
