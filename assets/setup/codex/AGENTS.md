# BEGIN hosted-skills-starter
For Hosted Skills work, read the local
`.agents/skills/azure-functions-hosted-skills/SKILL.md` before proceeding.
Use only this workspace/distribution's local skills by default. Read SKILL.md
files by their local paths, not by resolving skill names through another plugin.
Read lifecycle and update skills from the same local skill root.
The local azure-functions-hosted-skills skill owns Hosted Skills authoring,
validation, deployment, verification, and troubleshooting, with the local
Connector skills handling their lifecycle phases.
Do not load external plugin or user/global skills, including azure-functions-deploy,
azure-prepare, azure-validate, and azure-deploy, without an explicit user override.
An override requires the user to explicitly request the external skill and its
source for the current task; clarify an ambiguous source before loading it.
Generic requests to create, deploy, or troubleshoot are not overrides.
A reference or handoff in another skill is not an override either.
Keep an override limited to the requested task; do not make it the new default.
If a needed local skill or capability is missing, report the blocker and ask
before using an external skill; do not silently fall back.
Built-in tools, CLI commands, and a compatible reused Azure MCP are not external
skills and remain available within the user's approved action scope.
Use azure-functions-hosted-skills-migrate only when explicitly requested by name.
Starter setup is configuration, not app authoring: follow its `start.md` and
setup reference without invoking a separate Hosted Skills plugin.
Open azure-functions-hosted-skills-canvas only when the user explicitly asks to
open that canvas. A Hosted Skills, timer, or agent request alone is not consent
to open it. Do not disable or modify other plugins to enforce this preference.
These skills come from the Hosted Skills starter; preserve existing
app source, instructions, MCP servers, hooks, local settings, and credentials.
Retrieve the official application template into staging before merging app files.
Generation, local execution, Azure provisioning, Connector consent, and publishing
are separate actions with separate approvals. Never infer deployment approval.
Fresh setup defaults telemetry to enabled without a telemetry-choice question.
Honor existing opt-outs and explicit requests to disable it; the README documents
opt-out options. Do not turn file-change approval into a telemetry choice.
Development telemetry is best-effort and opt-out; do not retry an operation to
recover telemetry. Never download or install a telemetry SDK.
Missing Node.js must not block authoring: skip inactive telemetry and use the
official template manifest's GitHub fallback when Node-based Azure MCP is deferred.
# END hosted-skills-starter
