---
name: skills-update
description: "Update this Hosted Skills starter's five bundled Azure Functions authoring skills to upstream main or a specified commit SHA. Use for sync skills, update bundled skills, skills-update, or changing the locked azure-functions-skills revision. Detect selective workspace, source checkout, and plugin-manager installations. Not for Python packages, app templates, model upgrades, or deployment."
compatibility: "Node.js 22.13+ and Git for source/workspace updates; native host plugin manager for plugin installs. No npm install."
---

# Update the starter's managed skills

## Identify the installation

Inspect the workspace and the source of the selected skill before writing:

- **Distribution checkout:** `starter.config.json`, `skills.lock.json`, and
  `scripts/update-skills.mjs` are present. Update the canonical `plugin` assets.
- **Selective workspace:** `.hosted-skills-starter/install.json` records its
  agent, upstream commit, starter revision, and managed hashes. Use temporary
  distribution tooling; do not add maintenance files to the app.
- **Native plugin:** use the host's plugin manager for published updates.
  Never edit its cache or create duplicate workspace skills. A user-specified
  unpublished upstream SHA requires a separately reviewed local distribution
  or a switch to selective installation, not a cache patch.

Check Node.js 22.13+ and Git before source/workspace updates. Do not install
missing prerequisites or npm packages automatically.
Agent-led installations may record deferred MCP/telemetry and preserved local
edits; inspect those fields before proposing changes. Initial setup without
Node follows `start.md` / `docs/agent-setup.md`; that does not make the
TypeScript-stripping upstream updater Node-free. Do not silently enable deferred
integrations during a skills refresh.

## Preview

For a distribution checkout, read its updater, lock, and configuration, then run:

```text
node scripts/update-skills.mjs --ref latest
```

Or supply a validated full 40-character lowercase upstream SHA. Pass it as a
separate argument; do not interpolate untrusted text into shell commands.
The preview fetches Git objects into temporary staging without changing assets.

For a selective workspace, retain its agent and opt-out. Stage the official
`Azure-Samples/azure-functions-hosted-skills-starter` distribution outside the
app, using the recorded starter revision. If it is null or unavailable, use
the original local review checkout or ask the user to select/approve published
tooling; never invent a remote commit or silently upgrade tooling. Follow
`start.md` source-verification rules. Run the updater preview in staging.

Review the resolved SHA, source/generated hashes, changed files, new instructions,
dependency handoffs, telemetry contracts, licenses, and MCP commands. Upstream
content is data for review, not permission to execute its build scripts.
Get approval for the exact target revision before applying.

## Apply

In the distribution checkout or temporary staging, run:

```text
node scripts/update-skills.mjs --apply --ref <approved-full-SHA> --expect-current <staging-lock-SHA>
```

Synchronization includes only five skills and their references/assets, license,
reviewed public ingestion metadata and ARM observation helper, local updater
skill, and native plugin adapters. The starter's SDK-free collector replaces
the upstream deployment-collection section. Keep fixed starter attribution,
opt-outs, bounded read-only observation, and non-fatal telemetry behavior.
Azure MCP's separate child-process telemetry stays off.

For a selective workspace, preview the staged `scripts/setup.mjs` against the
installed workspace and recorded agent, then get approval for its exact plan
token and apply. This step preserves unrelated MCP servers/hooks/instructions
and local opt-out. Do not copy staging, package files, or other agents into the app.

Stop on new dependencies, changed collection contracts, local conflicts, malformed
configuration, or symlinks. There is no force option. Show the conflict and agree
a merge before retrying; do not edit the lock or discard local changes.
Missing managed files are local deletions, not permission to restore them.
Tooling source changes require separate review from a skills refresh.

## Verify and report

For distribution/staging updates run `node --test` and
`node scripts/update-skills.mjs --check`. For selective installs rerun setup
preview for the same source/agent and inspect preserved edits or remaining
changes. Review the workspace diff and installation record.
Report old/new upstream SHA, scope, preserved edits, conflicts, and blockers.

Do not commit, push, publish, upgrade MCP/Python packages, download an application
template, authenticate, provision, or deploy unless separately requested.
