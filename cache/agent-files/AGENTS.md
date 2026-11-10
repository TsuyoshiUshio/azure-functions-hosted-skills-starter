# Hosted Skills development

This project is already scaffolded. Do not fetch or reapply a template to begin
development. Read `.hosted-skills-template.json` for its pinned provenance.

Read the `azure-functions-hosted-skills` authoring skill in `.agents/skills/`
(Copilot/Codex) or `.claude/skills/` (Claude Code). Its references contain runtime,
trigger, MCP, testing and infrastructure guidance. No development MCP server is
required to edit this project. Additional deployment skills mentioned upstream
are optional installations for that later workflow, not bootstrap prerequisites.

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

Require separate user approval before tool installation, starting hosts or
containers, sending messages, provisioning Azure resources, or deploying.
Never commit `src/local.settings.json`, credentials or local environment state.
