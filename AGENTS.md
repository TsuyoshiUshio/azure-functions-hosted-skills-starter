# Hosted Skills starter

Read `README.md`. This is a distribution of development-time authoring skills,
not a Function App or maintained Dev Container.

For initial setup, follow `start.md`: select the OS and actual coding agent from
the execution context, run the matching remote installer once with JSON output,
and use its result for prerequisite guidance and the next authoring prompt.
Do not clone, inspect locks, query MCP, or manually install assets first.
For explicitly requested workspace-only integration without an app template,
follow `docs/setup.md` and `docs/agent-setup.md`; Node is optional for that
reviewed route. Preserve opt-outs and clean only owned staging. Do not install
assets merely to maintain this distribution or duplicate an enabled installation
of this starter. A different Azure Functions plugin is not this installation.
Setup applies the requested baseline, not AI customization: do not invoke another plugin's
same-named Hosted Skills skill to perform it. Open
azure-functions-hosted-skills-canvas only when the user explicitly asks to open
that canvas; a Hosted Skills or scheduled-agent request alone is not consent.

The default bootstrap applies a pinned sample and one cached authoring skill in
the intended current app directory, without Node or MCP; it does not install
the six-skill workspace integration. See `docs/bootstrap.md` for details.
Do not install both routes in one workspace. Maintain the cache independently
of `skills.lock.json`; preserve its byte hashes and upstream licenses.

Canonical skills live in `plugin/skills`; the local updater source is
`skills/skills-update/SKILL.md`. Read these local SKILL.md files rather than
resolving same-named skills through another installed plugin.
Use `azure-functions-hosted-skills` for app
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
and fixed starter attribution. Fresh setup defaults to enabled without asking a
telemetry-choice question; the README documents intentional opt-out.
Preserve opt-outs, time budgets, allowlisted
fields, and best-effort failure isolation. Do not add SDK/npm dependencies or
collect prompts, raw arguments, paths, resource identifiers, or persistent IDs.
Azure MCP's separate telemetry stays disabled in its child-process configuration.
Generated app monitoring is separate; keep sensitive content capture off.

Use `skills-update` for explicit synchronization. Preview the exact SHA; stop on
new dependencies, changed collection contracts, conflicts, or symlinked targets.
Never hide drift by editing hashes. Tooling changes are separately maintained.
For tooling changes run `node --test` and `node scripts/update-skills.mjs --check`;
no npm install, model call, production telemetry, or cloud deployment is needed.
