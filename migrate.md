# Migrate an existing project to Azure Functions Hosted Skills

Prepare the user's **existing project** for migration to Azure Functions Hosted
Skills, then ask what to migrate and hand off to the installed
`azure-functions-hosted-skills-migrate` skill. No application template is
applied: the migration skill scaffolds the Hosted Skill later, in a separate
target directory, after the user approves its plan.

This file is the only setup instruction. Until setup is reported, do not load
or invoke other Hosted Skills, Azure Functions, or canvas skills, even when host
skill routing suggests one. Already-loaded skills do not override this file.
Do not open azure-functions-hosted-skills-canvas unless the user explicitly asks.

## Install the skills into the existing project

Use the [workspace integration route](docs/setup.md#agent-led-workspace-integration)
from the same published snapshot of
`TsuyoshiUshio/azure-functions-hosted-skills-starter`, with its definition of
done. Do not run the cached-template bootstrap (`start.md`) and do not create a
new app or nested project. The target is the intended current project directory.

Reuse an enabled installation of this starter (workspace setup, bootstrap, or
plugin) when it already provides `azure-functions-hosted-skills-migrate` and
its sibling skills; skip installation and go to the final response. If the user
explicitly asked to disable telemetry, first apply that opt-out to the reused
installation, showing the configuration change and asking for approval before
writing. Do not duplicate skills or hooks. A different Azure Functions plugin is not this
installation.

### When approval is needed

Inventory every destination before writing, using the script preview
(`scripts/setup.mjs`) or the agent-led inventory from `docs/agent-setup.md`.

- **Nothing existing is touched:** if this is a fresh install (no
  `.hosted-skills-starter/install.json` exists), the preview has only `add`
  actions, and `conflicts` and `preserved` are empty (or every agent-led
  destination is missing), this migration setup request authorizes it. Briefly list the host,
  target, revision, and added paths, then apply that
  plan token without a separate approval question.
- **Existing files are affected:** if an installation record already exists
  (a partial or older install), any action is `update` or `delete`, any
  conflict or preserved edit is reported, or an agent-led merge changes an
  existing file (for example `AGENTS.md`, `CLAUDE.md`, MCP configuration, or
  hooks), show the minimal merge or replacement and ask for approval before writing.
  Preserve the user's files, settings, opt-outs, and application code.
  If the user declines, write nothing and stop.

Recheck files before applying; re-preview a stale plan. Fresh telemetry defaults
to enabled without a choice question; preserve existing opt-outs and honor an
explicit disable request. Do not install Node or other tools automatically.
Setup does not authorize authentication, local runs, Connector consent, app
generation, deployment, Git commit, or push.

## Final response: report and ask

Your final setup response has two required parts, in the user's language. They
override host brevity or word-limit guidance.

1. **Report:** **Hosted Skills migration setup complete!**, the selected host,
   installed local skill root, source revision, whether existing files were
   merged, and any reload/trust step or deferred optional integration.
2. **Ask one question:** what the user wants to migrate to Hosted Skills.
   Ask for the source (a skill, agent, workflow, script, automation, or
   instructions, with its path if it is a file), what it does, how it runs
   today (schedule, event, or on demand), and where its results go. If the host
   requires questions through a tool (for example `ask_user`), write the report
   as text, then call that tool with this question before ending the turn.
   Offer this example as inspiration, not a default to execute:

   *My GitHub Actions workflow `.github/workflows/weekly-releases.yml` reads new
   GitHub releases every Friday at 09:00 JST and posts a Teams digest.*

Do not read the migration source during setup. Do not ask further setup
questions or start migration before the answer.

## Hand off

When the user answers, setup is over. Read the generated workspace instructions
and the installed local
`azure-functions-hosted-skills-migrate` skill, not another plugin's same-named
skill, and start its workflow with the answer as the migration request. That
skill owns source-access consent, operation analysis, plans, approvals,
scaffolding, and verification; do not reimplement it from this file.

The migration skill runs only when the user names it and asks to use it. If
the user's request to follow this file already did so (for example, "use
azure-functions-hosted-skills-migrate"), the answer starts the migration.
Otherwise, show the answer rewritten as a copyable `Use azure-functions-hosted-skills-migrate
to ...` prompt and wait for the user to send it. A request for a new capability
with nothing to migrate belongs to `azure-functions-hosted-skills`; suggest it
without starting it.
