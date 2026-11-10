# Update cached-template bootstrap skills

This layout has `.hosted-skills-skills.json` and may have
`.hosted-skills-bootstrap.json`. It is not a selective workspace installation.
Do not run `setup.mjs`, add MCP/hooks, or reapply the app template to update skills.

The bootstrap supports skills from a reviewed published starter snapshot. For
an arbitrary upstream SHA not yet cached by that starter, explain that a separate
reviewed cache refresh is required; do not silently substitute another revision.
No initial setup tools become prerequisites merely because an update was requested.

1. Read the installed skill inventory, file baselines, source commit, and selected
   skill root (`.agents/skills` or `.claude/skills`). If both roots exist, retain
   both. Do not copy another agent's adapters.
2. Resolve a requested published starter revision, or latest starter main once
   to an immutable SHA, and stage that distribution outside the app. Review its
   `cache/skills.json`, `cache/files.tsv`, skill payloads, license, adaptation,
   dependency handoffs, and collection contracts. Verify hashes with native tools.
   Do not execute downloaded scripts or source instructions during preview.
3. Compare only the recorded skill files and license against `cache/skill`.
   Preserve unchanged upstream files with local edits. Stop on changed upstream
   files with local edits, deleted managed files, new-file collisions, unexpected
   dependencies, changed collection contracts, malformed records, or symlinks.
   Show old/new source revisions, additions/changes/deletions and conflicts.
4. Obtain approval for the exact revision and skills-only diff. Recheck all file
   hashes before writes. Apply the reviewed skill changes and license only,
   preserving unrelated skills, source, instructions, configuration, and opt-outs.
   Keep reversible backups until verification; restore only owned writes on
   failure, never a concurrent user edit.
5. Update `.hosted-skills-skills.json` from the reviewed snapshot only after
   successful application. Keep its source baselines, not hashes of preserved
   local edits. Record the selected starter SHA in this skill record; preserve
   the original app/template/bootstrap provenance. Verify installed bytes,
   relative references, frontmatter, and host discovery. Clean only owned staging
   and report retained backups or unverified runtime behavior.

Updating skills does not authorize authentication, provisioning, Connector
consent, sending messages, running the app, deployment, commits, or publication.
