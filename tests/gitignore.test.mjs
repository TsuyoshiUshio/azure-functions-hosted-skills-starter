import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function ignored(paths) {
  const result = spawnSync('git', ['-C', root, 'check-ignore', '--no-index', '--stdin'], {
    input: `${paths.join('\n')}\n`, encoding: 'utf8',
  });
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return new Set(result.stdout.trim().split(/\r?\n/).filter(Boolean));
}

test('local credentials, agent state, and emulator payloads stay out of Git', () => {
  const paths = [
    '.env', '.env.local', '.env.production', 'app/.env.development',
    '.npmrc', '.netrc', 'app/local.settings.json', 'app/.azure/config.json',
    'certificate.pfx', 'certificate.p12', 'node_modules/package/index.js',
    '.claude/settings.local.json', 'app/.claude/settings.local.json',
    '.github/copilot/settings.local.json', 'app/.github/copilot/settings.local.json',
    '.claude/.credentials.json', '.claude/history.jsonl', '.claude/projects/project/session.jsonl',
    '.claude/debug/session.log', '.codex/auth.json', '.codex/auth.json.bak',
    '.codex/history.jsonl', '.codex/sessions/session.jsonl', '.codex/log/session.log',
    '.codex/state_5.sqlite', '.codex/state_5.sqlite-wal',
    '.copilot/session-state/session/data.json', '.copilot/logs/session.log',
    '.azurite/data.json', '__azurite_db_blob__.json', 'app/__azurite_db_queue__.json',
    '__blobstorage__/payload', '__queuestorage__/payload',
    '.starter-sync.lock', 'plugin/config.json.starter-123.tmp', '.DS_Store', 'Thumbs.db',
  ];
  assert.deepEqual([...ignored(paths)].sort(), [...paths].sort());
});

test('shared instructions, adapters, examples, and every locked asset remain distributable', () => {
  const lock = JSON.parse(readFileSync(join(root, 'skills.lock.json'), 'utf8'));
  const paths = [
    ...Object.keys(lock.files), 'README.md', 'AGENTS.md', 'CLAUDE.md',
    '.github/copilot-instructions.md', '.env.example', '.env.sample', '.env.template',
    'app/.env.example', '.claude/settings.json', '.codex/config.toml',
    '.codex/hooks.json', '.vscode/mcp.json', '.mcp.json',
    '.hosted-skills-starter/install.json', '.hosted-skills-starter/telemetry.config.json',
    '.github/hooks/hosted-skills-starter.json', 'docs/images/hosted-skills-banner.png',
    'setup.ps1', 'setup.sh', 'starter.config.json', 'skills.lock.json',
  ];
  assert.deepEqual([...ignored(paths)], []);
});
