import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  applyUpdate, checkWorkspace, collectFiles, hash, managedPath, planUpdate, readLock, repository, skills,
} from '../scripts/update-skills.mjs';
import { hostFiles, json, skillRoots } from '../scripts/host-config.mjs';
import { adaptSkillContent, contentPolicy } from '../scripts/skill-content.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'starter.config.json'), 'utf8'));
const skillPath = 'plugin/skills/azure-functions-hosted-skills/SKILL.md';
const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'hosted-skills-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function put(directory, path, text) {
  const full = join(directory, ...path.split('/'));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function makeLock(files, commit = oldSha) {
  return { schemaVersion: 1, upstream: repository, commit,
    files: Object.fromEntries([...files].map(([path, content]) => [path, hash(content)])) };
}

function seed(directory, entries) {
  const files = new Map(entries);
  for (const [path, content] of files) put(directory, path, content);
  const lock = makeLock(files);
  put(directory, 'skills.lock.json', json(lock));
  return lock;
}

test('allowlist excludes app files, unrelated skills, containers and traversal', () => {
  for (const path of ['README.md', 'src/function_app.py', 'infra/main.bicep', '.devcontainer/a',
    '.git/config',
    '.github/hooks/runtime/telemetry.mjs', '.agents/skills/unrelated/SKILL.md', `${skillPath}/../x`,
    `${skillPath}\\..\\x`, '/.mcp.json']) assert.equal(managedPath(path), false, path);
  assert.equal(managedPath(skillPath), true);
  assert.equal(managedPath(`${skillPath}\nother`), false);
});

test('preview plans additions, replacements and obsolete managed files without writes', t => {
  const directory = workspace(t);
  const obsolete = 'plugin/skills/azure-functions-hosted-skills/references/old.md';
  const before = seed(directory, [[skillPath, 'old'], [obsolete, 'obsolete']]);
  const files = new Map([[skillPath, 'new'], ['.mcp.json', '{}\n']]);
  const plan = planUpdate(directory, files, before);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.changes.map(change => change.action).sort(), ['add', 'delete', 'update']);
  assert.equal(readFileSync(join(directory, skillPath), 'utf8'), 'old');
  assert.equal(readLock(directory).commit, oldSha);
});

test('apply changes only managed files and updates SHA and hashes', t => {
  const directory = workspace(t);
  const obsolete = 'plugin/skills/azure-functions-hosted-skills/references/old.md';
  seed(directory, [[skillPath, 'old'], [obsolete, 'obsolete']]);
  for (const path of ['src/function_app.py', 'src/local.settings.json', 'infra/main.bicep',
    '.azure/state.json', '.agents/skills/unrelated/SKILL.md', '.claude/settings.json']) {
    put(directory, path, 'keep');
  }
  const previous = readFileSync(join(directory, 'skills.lock.json'), 'utf8');
  const files = new Map([[skillPath, 'new']]);
  applyUpdate(directory, files, makeLock(files, newSha), previous);
  assert.equal(readLock(directory).commit, newSha);
  assert.equal(existsSync(join(directory, obsolete)), false);
  assert.deepEqual(checkWorkspace(directory).changed, []);
  assert.equal(readFileSync(join(directory, 'src/local.settings.json'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(directory, '.azure/state.json'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(directory, '.agents/skills/unrelated/SKILL.md'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(directory, '.claude/settings.json'), 'utf8'), 'keep');
});

test('local edits, new-file collisions and changed deletions block the whole apply', t => {
  const directory = workspace(t);
  seed(directory, [[skillPath, 'old']]);
  put(directory, skillPath, 'local edit');
  const previous = readFileSync(join(directory, 'skills.lock.json'), 'utf8');
  const files = new Map([[skillPath, 'upstream new'], ['.mcp.json', '{}']]);
  assert.throws(() => applyUpdate(directory, files, makeLock(files, newSha), previous), /Local edit conflicts/);
  assert.equal(existsSync(join(directory, '.mcp.json')), false);
  assert.equal(readFileSync(join(directory, skillPath), 'utf8'), 'local edit');
  assert.equal(readLock(directory).commit, oldSha);
  assert.deepEqual(planUpdate(directory, new Map(), readLock(directory)).conflicts, [skillPath]);
  put(directory, '.mcp.json', '{"mcpServers":{"mine":{}}}');
  assert.ok(planUpdate(directory, files, readLock(directory)).conflicts.includes('.mcp.json'));
});

test('unchanged generated config preserves unrelated user MCP entries', t => {
  const directory = workspace(t);
  const initial = '{"mcpServers":{"azure":{}}}';
  const lock = seed(directory, [['.mcp.json', initial]]);
  const custom = '{"mcpServers":{"azure":{},"mine":{}}}';
  put(directory, '.mcp.json', custom);
  const files = new Map([['.mcp.json', initial]]);
  const plan = applyUpdate(directory, files, makeLock(files, newSha),
    readFileSync(join(directory, 'skills.lock.json'), 'utf8'));
  assert.deepEqual(plan.preserved, ['.mcp.json']);
  assert.equal(readFileSync(join(directory, '.mcp.json'), 'utf8'), custom);
  assert.equal(lock.files['.mcp.json'], readLock(directory).files['.mcp.json']);
  assert.deepEqual(checkWorkspace(directory).changed, ['.mcp.json']);
});

test('same snapshot is idempotent and stale lock is rejected', t => {
  const directory = workspace(t);
  seed(directory, [[skillPath, 'same']]);
  const previous = readFileSync(join(directory, 'skills.lock.json'), 'utf8');
  const files = new Map([[skillPath, 'same']]);
  assert.deepEqual(applyUpdate(directory, files, makeLock(files), previous).changes, []);
  assert.equal(readFileSync(join(directory, 'skills.lock.json'), 'utf8'), previous);
  assert.throws(() => applyUpdate(directory, files, makeLock(files), 'stale'), /lock changed/);
});

test('I/O failure rolls back prior writes and preserves the old lock', t => {
  const directory = workspace(t);
  seed(directory, [[skillPath, 'old']]);
  const previous = readFileSync(join(directory, 'skills.lock.json'), 'utf8');
  const files = new Map([[skillPath, 'new'], ['.mcp.json', 'new config']]);
  let writes = 0;
  assert.throws(() => applyUpdate(directory, files, makeLock(files, newSha), previous, (path, content) => {
    if (++writes === 2) throw new Error('injected disk failure');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }), /injected disk failure/);
  assert.equal(readFileSync(join(directory, skillPath), 'utf8'), 'old');
  assert.equal(readFileSync(join(directory, 'skills.lock.json'), 'utf8'), previous);
  assert.equal(existsSync(join(directory, '.mcp.json')), false);
  assert.equal(existsSync(join(directory, '.starter-sync.lock')), false);
});

test('symlinked directories and malicious lock entries are rejected', t => {
  const directory = workspace(t);
  const outside = workspace(t);
  symlinkSync(outside, join(directory, 'plugin'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => planUpdate(directory, new Map([[skillPath, 'bad']]), undefined), /symlink/);
  put(directory, 'skills.lock.json', json(makeLock(new Map([['README.md', 'not managed']]))));
  assert.throws(() => readLock(directory), /Invalid managed entry/);
});

test('native plugin manifests share skills and MCP but select host-specific hooks', () => {
  const files = hostFiles(config);
  const portable = JSON.parse(files.get('plugin/.mcp.json'));
  assert.deepEqual(portable.mcpServers.azure, config.mcp.azure);
  assert.equal(portable.mcpServers.azure.env.AZURE_MCP_COLLECT_TELEMETRY, 'false');
  const claude = JSON.parse(files.get('plugin/.claude-plugin/plugin.json'));
  const codex = JSON.parse(files.get('plugin/.codex-plugin/plugin.json'));
  const copilot = JSON.parse(files.get('plugin/plugin.json'));
  assert.equal(claude.skills, './skills/');
  assert.equal(claude.mcpServers, './.mcp.json');
  assert.equal('hooks' in claude, false);
  assert.equal(codex.hooks, './hooks/codex-hooks.json');
  assert.deepEqual(copilot.hooks, { paths: ['./hooks/copilot-hooks.json'], exclusive: true });
  assert.match(files.get('plugin/hooks/codex-hooks.json'), /commandWindows/);
  assert.equal(files.has('.claude/settings.json'), false);
  assert.equal(files.has('.mcp.json'), false);
  assert.deepEqual(skillRoots, ['plugin/skills']);
});

test('content policy replaces only the deployment collector section, preserving app observability', () => {
  const source = [
    '# Instructions', '',
    'After a complete `azd up` or a standalone `azd provision` succeeds, run the local',
    'deployment-observation collector exactly once.', '',
    '## Safety rules', '',
    '- Preserve user settings.',
    '- Do not run a deployment collector from this connector skill. The',
    '  `azure-functions-hosted-skills` skill owns the internal `azure_deployment_observed`',
    '  event after its supported deployment command succeeds. Do not duplicate that event.', '',
    'This skill does not emit `azure_deployment_observed`; its existing owners remain unchanged.', '',
    '## Report a successful deployment (internal telemetry)', '',
    'node telemetry.mjs deployment-observed', '',
    '## Observability', '',
    'Use azurefunctions-agents-runtime[monitor] for Application Insights.', '',
  ].join('\n');
  const path = 'azure-functions-hosted-skills/references/infra-and-deployment.md';
  const adapted = adaptSkillContent(path, Buffer.from(source));
  assert.ok(adapted.includes('.hosted-skills-starter/telemetry.mjs'));
  assert.ok(adapted.includes('checks opt-out before any Azure CLI query'));
  assert.ok(adapted.includes('- Preserve user settings.'));
  assert.ok(adapted.includes('## Observability'));
  assert.ok(adapted.includes('azurefunctions-agents-runtime[monitor]'));
  assert.deepEqual(adaptSkillContent(path, adapted), adapted);
  assert.deepEqual(adaptSkillContent('SKILL.md', Buffer.from(source)), Buffer.from(source));
  assert.throws(() => adaptSkillContent(path, Buffer.from('changed headings')), /instructions changed/);
});

test('updater refuses Azure MCP telemetry being re-enabled', async () => {
  const modified = structuredClone(config);
  modified.mcp.azure.env.AZURE_MCP_COLLECT_TELEMETRY = 'true';
  await assert.rejects(collectFiles('', oldSha, modified), /Azure MCP telemetry disabled/);
});

test('checked-in distribution is intact, complete, dependency-free and starter-attributed', () => {
  assert.deepEqual(checkWorkspace(root).changed, []);
  for (const name of [...skills, 'skills-update']) {
    const copies = skillRoots.map(directory => readFileSync(join(root, directory, name, 'SKILL.md'), 'utf8'));
    assert.match(copies[0], new RegExp(`name: ${name}\\b`));
  }
  for (const path of Object.keys(readLock(root).files)) {
    assert.equal(path.includes('.devcontainer'), false);
    if (/\.(md|json|mjs|toml)$/.test(path)) {
      assert.equal(readFileSync(join(root, path), 'utf8').includes('\r\n'), false, path);
    }
    if (path.startsWith('plugin/skills/') && path.endsWith('.md')) {
      const bytes = readFileSync(join(root, path));
      assert.deepEqual(adaptSkillContent(path.slice('plugin/skills/'.length), bytes), bytes);
    }
  }
  assert.equal(readLock(root).contentPolicy, contentPolicy);
  assert.equal(readLock(root).telemetryDistribution, 'hosted-skills-starter');
  assert.equal(existsSync(join(root, 'plugin/hooks/runtime/telemetry.mjs')), true);
  assert.equal(Object.keys(readLock(root).files).some(path => path.startsWith('.claude/skills/')), false);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
});

test('upstream collection copies complete allowlisted assets and detects new dependencies', async t => {
  const source = workspace(t);
  const local = workspace(t);
  const plugin = '.github/plugins/azure-functions-skills';
  put(local, 'skills/skills-update/SKILL.md', 'local updater');
  put(local, 'scripts/telemetry.mjs', 'export const distribution = "hosted-skills-starter";');
  put(local, 'assets/workspace-instructions.md', 'fixture workspace instructions\n');
  put(source, 'package.json', json({ version: '0.0.7-preview' }));
  put(source, 'LICENSE', 'fixture license');
  put(source, `${plugin}/hooks/runtime/telemetry.mjs`, 'must not copy');
  for (const name of skills) put(source, `${plugin}/skills/${name}/SKILL.md`, `---\nname: ${name}\n---\nfixture\n`);
  const originalSkill = `---\nname: ${skills[0]}\n---\n\nKeep application monitoring.\n`;
  const deployment = '## Report a successful deployment (internal telemetry)\n\nold collector\n\n## Observability\nKeep monitoring.\n';
  put(source, `${plugin}/skills/${skills[0]}/SKILL.md`, originalSkill);
  put(source, `${plugin}/skills/${skills[0]}/references/infra-and-deployment.md`, deployment);
  put(source, `${plugin}/skills/${skills[0]}/assets/example.txt`, 'asset');
  const binary = Buffer.from([0, 0xff, 0xfe, 0x80, 10]);
  put(source, `${plugin}/skills/${skills[0]}/assets/example.bin`, binary);
  put(source, `${plugin}/skills/azure-functions-doctor/SKILL.md`, 'must not copy');
  put(source, '.devcontainer/devcontainer.json', '{}');
  put(source, 'src/telemetry/public-config.ts',
    "export const PUBLIC_TELEMETRY_INSTRUMENTATION_KEY = '00000000-0000-0000-0000-000000000000';\n"
    + "export const PUBLIC_TELEMETRY_INGESTION_ENDPOINT = 'https://westus2-2.in.applicationinsights.azure.com';\n");
  put(source, 'src/telemetry/arm-deployments.ts', 'export function fixture(value: string): string { return value; }\n');
  function git(...args) {
    return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
  const commit = git('rev-parse', 'HEAD').trim();
  const result = await collectFiles(source, commit, config, local);
  assert.equal(result.files.get(`plugin/skills/${skills[0]}/assets/example.txt`).toString(), 'asset');
  assert.deepEqual(result.files.get(`plugin/skills/${skills[0]}/assets/example.bin`), binary);
  assert.equal([...result.files.keys()].some(path =>
    path.includes('doctor') || path.includes('.devcontainer')), false);
  assert.equal(result.files.get('plugin/hooks/runtime/arm-deployments.mjs').includes(': string'), false);
  assert.doesNotMatch(result.files.get('plugin/hooks/runtime/arm-deployments.mjs'), /[ \t]+$/m);
  assert.equal(result.files.get('plugin/hooks/runtime/telemetry.mjs').includes('must not copy'), false);
  assert.ok(result.lock.sourceFiles['src/telemetry/arm-deployments.ts']);
  assert.equal(result.lock.contentPolicy, contentPolicy);
  const renderedPath = `plugin/skills/${skills[0]}/SKILL.md`;
  assert.ok(result.files.get(renderedPath).includes('Keep application monitoring.'));
  assert.equal(result.lock.sourceFiles[`${plugin}/skills/${skills[0]}/SKILL.md`], hash(originalSkill));
  assert.notEqual(result.lock.files[`plugin/skills/${skills[0]}/references/infra-and-deployment.md`], hash(deployment));
  assert.equal(result.lock.commit, commit);
  put(source, 'src/telemetry/arm-deployments.ts', "import sdk from 'unreviewed-runtime-package';\nexport const collector = sdk;\n");
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'new runtime dependency');
  await assert.rejects(collectFiles(source, git('rev-parse', 'HEAD').trim(), config, local), /runtime dependency/);
  put(source, `${plugin}/skills/${skills[0]}/SKILL.md`, 'azure-functions-new-dependency');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'new dependency');
  await assert.rejects(collectFiles(source, git('rev-parse', 'HEAD').trim(), config, local), /dependency review/);
});
