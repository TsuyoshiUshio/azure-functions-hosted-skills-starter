# BEGIN hosted-skills-starter
For Hosted Skills work, read the local
`.github/skills/azure-functions-hosted-skills/SKILL.md` before proceeding.
Read lifecycle and update skills from the same local skill root. Prefer these
workspace/distribution-local files over same-named skills from another plugin;
do not resolve a skill by name alone when its local file is available.
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
