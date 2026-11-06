# Hosted Skills starter

Read `README.md`. This is a distribution of development-time authoring skills,
not a Function App or maintained Dev Container.

For initial setup, follow `start.md` and `docs/agent-setup.md`. Node is optional:
use the script when available, or apply a reviewed agent-led merge from the
locked host blueprints and satisfy the same DoD. Preserve opt-outs, clean owned
staging, and finish with creation/migration prompt examples. Do not install
assets merely to maintain this distribution or duplicate an enabled plugin.

Canonical skills live in `plugin/skills`; the local updater source is
`skills/skills-update/SKILL.md`. Use `azure-functions-hosted-skills` for app
authoring and the three Connector skills for their lifecycle handoffs.
Use migration only when explicitly requested by name, never merely quoted.
Generated app `src/skills` and `.agent.md` files belong to the runtime, not the
coding-agent distribution.

Retrieve the official `ai-hosted-skills-python` template using the live Functions
manifest, Azure MCP, then its exact GitHub repository/folder/gitRef fallback.
Stage and review the merge; preserve existing instructions, skills, settings,
source and infrastructure. Exclude `.devcontainer` and unused sample resources.
Record the template ref/SHA independently of the skills lock.
Development stdio MCP is not a deployed Hosted Skill remote HTTP MCP server.

Do not infer approval for installation, authentication, local runs, Connector
consent, external writes, provisioning, deployment, commits, or publication.
Show subscription, region, resource scope and costs before deployment approval.
Never expose secrets; keep local settings, `.azure`, and emulator state out of
Git. Preserve preexisting processes, data, and user configuration.

Telemetry uses only Node standard APIs, the upstream public ingestion destination,
and fixed starter attribution. Preserve opt-outs, time budgets, allowlisted
fields, and best-effort failure isolation. Do not add SDK/npm dependencies or
collect prompts, raw arguments, paths, resource identifiers, or persistent IDs.
Azure MCP's separate telemetry stays disabled in its child-process configuration.
Generated app monitoring is separate; keep sensitive content capture off.

Use `skills-update` for explicit synchronization. Preview the exact SHA; stop on
new dependencies, changed collection contracts, conflicts, or symlinked targets.
Never hide drift by editing hashes. Tooling changes are separately maintained.
For tooling changes run `node --test` and `node scripts/update-skills.mjs --check`;
no npm install, model call, production telemetry, or cloud deployment is needed.
