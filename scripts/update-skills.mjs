import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { hostFiles, json, skillRoots } from './host-config.mjs';
import { adaptSkillContent, contentPolicy } from './skill-content.mjs';

export const repository = 'Azure/azure-functions-skills';
export const skills = [
  'azure-functions-hosted-skills',
  'azure-functions-hosted-skills-migrate',
  'azure-functions-connector-create',
  'azure-functions-connector-mcp',
  'azure-functions-connector-validate',
];
const plugin = '.github/plugins/azure-functions-skills';
const lockName = 'skills.lock.json';
const root = fileURLToPath(new URL('../', import.meta.url));
const fixedPaths = new Set([
  '.mcp.json', '.vscode/mcp.json', '.codex/config.toml', '.starter/upstream-LICENSE',
  '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json',
  'plugin/.claude-plugin/plugin.json', 'plugin/.codex-plugin/plugin.json', 'plugin/plugin.json',
  'plugin/.mcp.json', 'plugin/upstream-LICENSE',
  'plugin/hooks/hooks.json', 'plugin/hooks/codex-hooks.json', 'plugin/hooks/copilot-hooks.json',
  'plugin/hooks/telemetry.config.json', 'plugin/hooks/runtime/telemetry.mjs',
  'plugin/hooks/runtime/arm-deployments.mjs', 'plugin/hooks/runtime/telemetry-config.json',
  '.mcp.json', '.claude/settings.json', '.codex/hooks.json', 'AGENTS.md',
  '.github/hooks/hosted-skills-starter.json', '.github/instructions/hosted-skills-starter.instructions.md',
  '.claude/rules/hosted-skills-starter.md', '.codex/config.toml', '.vscode/mcp.json',
  '.hosted-skills-starter/telemetry.mjs', '.hosted-skills-starter/arm-deployments.mjs',
  '.hosted-skills-starter/telemetry-config.json', '.hosted-skills-starter/telemetry.config.json',
  '.hosted-skills-starter/upstream-LICENSE',
  'assets/workspace-instructions.md',
  'assets/setup/claude/.mcp.json', 'assets/setup/claude/.claude/settings.json',
  'assets/setup/codex/.codex/config.toml', 'assets/setup/codex/.codex/hooks.json',
  'assets/setup/copilot/.mcp.json', 'assets/setup/copilot/.github/hooks/hosted-skills-starter.json',
  'assets/setup/vscode/.vscode/mcp.json', 'assets/setup/vscode/.github/hooks/hosted-skills-starter.json',
]);
const workspaceSkillRoots = ['.claude/skills', '.agents/skills', '.github/skills'];
export const hash = content => createHash('sha256').update(content).digest('hex');

export function managedPath(path) {
  if (typeof path !== 'string' || /[\x00-\x1f\x7f]/.test(path) || path.includes('\\') || path.includes(':')
    || path.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return fixedPaths.has(path) || [...skillRoots, ...workspaceSkillRoots].some(directory =>
    [...skills, 'skills-update'].some(skill => path.startsWith(`${directory}/${skill}/`)));
}

function safePath(directory, path) {
  if (!managedPath(path) && ![lockName, '.starter-sync.lock', '.hosted-skills-starter/install.json'].includes(path)) {
    throw new Error(`Not a managed path: ${path}`);
  }
  const destination = resolve(directory, ...path.split('/'));
  const child = relative(directory, destination);
  if (child.startsWith('..') || isAbsolute(child)) throw new Error(`Path escapes workspace: ${path}`);
  if (lstatSync(directory).isSymbolicLink()) throw new Error(`Refusing symlink/reparse point: ${directory}`);
  let current = directory;
  for (const part of child.split(/[\\/]/)) {
    current = join(current, part);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Refusing symlink/reparse point: ${path}`);
    }
  }
  return destination;
}

export function readCurrent(directory, path) {
  const full = safePath(directory, path);
  if (!existsSync(full)) return undefined;
  if (!lstatSync(full).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(full);
}

export function readLock(directory, name = lockName) {
  const bytes = readCurrent(directory, name);
  if (!bytes) return undefined;
  const lock = JSON.parse(bytes);
  if (lock.schemaVersion !== 1 || lock.upstream !== repository
    || !/^[a-f0-9]{40}$/.test(lock.commit) || !lock.files || Array.isArray(lock.files)) {
    throw new Error('Invalid skills.lock.json; restore it from version control before updating.');
  }
  for (const [path, digest] of Object.entries(lock.files)) {
    if (!managedPath(path) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error(`Invalid managed entry in skills.lock.json: ${path}`);
    }
  }
  return lock;
}

export function planUpdate(directory, files, previous) {
  const changes = [];
  const conflicts = [];
  const preserved = [];
  for (const path of [...new Set([...Object.keys(previous?.files ?? {}), ...files.keys()])].sort()) {
    if (!managedPath(path)) throw new Error(`Not a managed path: ${path}`);
    const bytes = readCurrent(directory, path);
    const current = bytes === undefined ? undefined : hash(bytes);
    const before = previous?.files[path];
    const after = files.has(path) ? hash(files.get(path)) : undefined;
    if (current === after) continue;
    if (before !== undefined && before === after && current !== undefined) {
      preserved.push(path);
      continue;
    }
    if (current !== before) {
      conflicts.push(path);
      continue;
    }
    changes.push({ path, action: after === undefined ? 'delete' : current === undefined ? 'add' : 'update',
      before: current ?? null, after: after ?? null });
  }
  return { changes, conflicts, preserved };
}

function atomicWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.starter-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function applyUpdate(directory, files, lock, expectedLockBytes, write = atomicWrite, name = lockName, mergeHashes = {}) {
  const guard = safePath(directory, '.starter-sync.lock');
  const fd = openSync(guard, 'wx');
  const written = [];
  try {
    const currentLock = readCurrent(directory, name);
    if ((currentLock?.toString('utf8')) !== expectedLockBytes) {
      throw new Error('The lock changed after preview. Run preview again.');
    }
    const previous = readLock(directory, name);
    for (const [path, digest] of Object.entries(mergeHashes)) {
      const current = readCurrent(directory, path);
      if ((current === undefined ? null : hash(current)) !== digest) {
        throw new Error(`Concurrent edit detected: ${path}`);
      }
    }
    const baseline = { ...previous, files: { ...previous?.files } };
    for (const [path, digest] of Object.entries(mergeHashes)) {
      if (digest === null) delete baseline.files[path];
      else baseline.files[path] = digest;
    }
    const plan = planUpdate(directory, files, baseline);
    if (plan.conflicts.length) throw new Error(`Local edit conflicts; nothing changed:\n${plan.conflicts.join('\n')}`);
    for (const change of plan.changes) {
      const current = readCurrent(directory, change.path);
      if ((current === undefined ? null : hash(current)) !== change.before) {
        throw new Error(`Concurrent edit detected: ${change.path}`);
      }
      const full = safePath(directory, change.path);
      const next = files.get(change.path);
      if (next === undefined) unlinkSync(full);
      else write(full, next);
      written.push({ path: change.path, previous: current, next });
    }
    write(safePath(directory, name), json(lock));
    return plan;
  } catch (error) {
    const rollbackConflicts = [];
    for (const entry of written.reverse()) {
      const current = readCurrent(directory, entry.path);
      if ((current === undefined ? undefined : hash(current))
        !== (entry.next === undefined ? undefined : hash(entry.next))) {
        rollbackConflicts.push(entry.path);
        continue;
      }
      const full = safePath(directory, entry.path);
      if (entry.previous === undefined) unlinkSync(full);
      else atomicWrite(full, entry.previous);
    }
    if (rollbackConflicts.length) {
      throw new Error(`Update failed; concurrent edits prevented rollback for: ${rollbackConflicts.join(', ')}`, { cause: error });
    }
    throw error;
  } finally {
    closeSync(fd);
    unlinkSync(guard);
  }
}

function gitBytes(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], {
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(directory, ...args) {
  return gitBytes(directory, ...args).toString('utf8');
}

function validateConfig(config) {
  if (config.schemaVersion !== 1 || config.upstream !== repository
    || JSON.stringify(config.skills) !== JSON.stringify(skills)) {
    throw new Error('The upstream and five-skill allowlist require a reviewed updater change.');
  }
  const server = config.mcp?.azure;
  if (server?.command !== 'npx' || !Array.isArray(server.args)
    || server.args.length !== 4 || server.args[0] !== '-y'
    || !/^@azure\/mcp@\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(server.args[1])
    || server.args[2] !== 'server' || server.args[3] !== 'start') {
    throw new Error('Azure MCP must use an exact @azure/mcp version and the reviewed server command.');
  }
  if (server.env?.AZURE_MCP_COLLECT_TELEMETRY !== 'false') {
    throw new Error('Keep unrelated Azure MCP telemetry disabled; starter telemetry has its own opt-out.');
  }
}

export async function collectFiles(source, commit, config, localRoot = root) {
  validateConfig(config);
  const entries = git(source, 'ls-tree', '-r', '-z', commit).split('\0').filter(Boolean).map(entry => {
    const [metadata, path] = entry.split('\t');
    return { mode: metadata.split(' ')[0], path };
  });
  const read = path => gitBytes(source, 'show', `${commit}:${path}`);
  const files = hostFiles(config);
  const sourceHashes = {};
  const references = new Set();
  for (const name of skills) {
    const prefix = `${plugin}/skills/${name}/`;
    const selected = entries.filter(entry => entry.path.startsWith(prefix));
    if (!selected.some(entry => entry.path === `${prefix}SKILL.md`)) {
      throw new Error(`Required upstream skill is missing: ${name}`);
    }
    for (const entry of selected) {
      if (!['100644', '100755'].includes(entry.mode)) {
        throw new Error(`Upstream symlinks/submodules are not supported: ${entry.path}`);
      }
      const suffix = entry.path.slice(`${plugin}/skills/`.length);
      const upstreamContent = read(entry.path);
      const content = adaptSkillContent(suffix, upstreamContent);
      if (entry.path.endsWith('/SKILL.md')) {
        for (const match of content.toString('utf8').matchAll(/\bazure-functions-[a-z-]+\b/g)) references.add(match[0]);
      }
      for (const directory of skillRoots) files.set(`${directory}/${suffix}`, content);
      sourceHashes[entry.path] = hash(upstreamContent);
    }
  }
  // The deploy name occurs as documentation, not as a required execution handoff in this snapshot.
  const unknown = [...references].filter(name => !skills.includes(name) && name !== 'azure-functions-deploy');
  if (unknown.length) throw new Error(`New skill references require dependency review: ${unknown.join(', ')}`);
  const packageBytes = read('package.json');
  const pkg = JSON.parse(packageBytes);
  sourceHashes['package.json'] = hash(packageBytes);
  const license = read('LICENSE');
  sourceHashes.LICENSE = hash(license);
  files.set('plugin/upstream-LICENSE', license);
  const publicSource = read('src/telemetry/public-config.ts');
  const publicText = publicSource.toString('utf8');
  const instrumentationKey = publicText.match(/PUBLIC_TELEMETRY_INSTRUMENTATION_KEY = '([a-f0-9-]{36})'/)?.[1];
  const endpoint = publicText.match(/PUBLIC_TELEMETRY_INGESTION_ENDPOINT = '(https:\/\/[a-z0-9-]+\.in\.applicationinsights\.azure\.com)'/)?.[1];
  if (!instrumentationKey || !endpoint) throw new Error('Upstream public telemetry destination changed; review before updating.');
  const armSource = read('src/telemetry/arm-deployments.ts');
  const armText = armSource.toString('utf8');
  const imports = [...armText.matchAll(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)];
  if (imports.some(match => !match[1].startsWith('node:'))) {
    throw new Error('ARM collector added a runtime dependency; review before updating.');
  }
  sourceHashes['src/telemetry/public-config.ts'] = hash(publicSource);
  sourceHashes['src/telemetry/arm-deployments.ts'] = hash(armSource);
  files.set('plugin/hooks/runtime/arm-deployments.mjs',
    stripTypeScriptTypes(armText, { mode: 'transform' }));
  files.set('plugin/hooks/runtime/telemetry.mjs',
    readFileSync(join(localRoot, 'scripts', 'telemetry.mjs')));
  files.set('assets/workspace-instructions.md',
    readFileSync(join(localRoot, 'assets', 'workspace-instructions.md')));
  const updater = readFileSync(join(localRoot, 'skills', 'skills-update', 'SKILL.md'), 'utf8');
  for (const directory of skillRoots) files.set(`${directory}/skills-update/SKILL.md`, updater);
  const skillFiles = [...files.keys()].filter(path => path.startsWith('plugin/skills/'))
    .map(path => path.slice('plugin/skills/'.length)).sort();
  files.set('plugin/hooks/runtime/telemetry-config.json', json({
    instrumentationKey, endpoint, skillsVersion: pkg.version, skillFiles,
  }));
  const lock = {
    schemaVersion: 1, upstream: repository, commit, upstreamVersion: pkg.version,
    skills, contentPolicy, telemetryDistribution: 'hosted-skills-starter',
    sourceFiles: Object.fromEntries(Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b))),
    files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => [path, hash(content)])),
  };
  return { files, lock };
}

export function checkWorkspace(directory) {
  const lock = readLock(directory);
  if (!lock) throw new Error('skills.lock.json is missing.');
  const changed = Object.entries(lock.files).filter(([path, digest]) => {
    const bytes = readCurrent(directory, path);
    return bytes === undefined || hash(bytes) !== digest;
  }).map(([path]) => path);
  if (existsSync(join(directory, 'starter.config.json'))) {
    const config = JSON.parse(readFileSync(join(directory, 'starter.config.json'), 'utf8'));
    validateConfig(config);
    for (const [path, content] of hostFiles(config)) {
      if (lock.files[path] !== hash(content)) changed.push(path);
    }
    const updater = readFileSync(join(directory, 'skills', 'skills-update', 'SKILL.md'));
    for (const skillRoot of skillRoots) {
      const path = `${skillRoot}/skills-update/SKILL.md`;
      if (lock.files[path] !== hash(updater)) changed.push(path);
    }
    if (lock.files['plugin/hooks/runtime/telemetry.mjs']
      !== hash(readFileSync(join(directory, 'scripts', 'telemetry.mjs')))) {
      changed.push('plugin/hooks/runtime/telemetry.mjs');
    }
  }
  return { commit: lock.commit, managedFiles: Object.keys(lock.files).length, changed: [...new Set(changed)].sort() };
}

export async function main(args = process.argv.slice(2)) {
  let mode = 'preview';
  let ref = 'latest';
  let expected;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply' || args[i] === '--check') {
      if (mode !== 'preview') throw new Error('Choose only one mode.');
      mode = args[i].slice(2);
    } else if (args[i] === '--ref' && args[i + 1]) ref = args[++i];
    else if (args[i] === '--expect-current' && args[i + 1]) expected = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (mode === 'check') {
    const result = checkWorkspace(root);
    console.log(json(result));
    if (result.changed.length) process.exitCode = 1;
    return;
  }
  if (ref !== 'latest' && !/^[a-f0-9]{40}$/.test(ref)) {
    throw new Error('Use latest or a full 40-character lowercase commit SHA.');
  }
  if (mode === 'apply' && ref === 'latest') {
    throw new Error('Preview latest first, then apply its exact resolved SHA.');
  }
  const lockBytes = readCurrent(root, lockName)?.toString('utf8');
  const previous = readLock(root);
  if (mode === 'apply' && previous && expected !== previous.commit) {
    throw new Error('Pass --expect-current with the current lock SHA after reviewing the preview.');
  }
  const config = JSON.parse(readFileSync(join(root, 'starter.config.json'), 'utf8'));
  validateConfig(config);
  const source = mkdtempSync(join(tmpdir(), 'hosted-skills-fetch-'));
  try {
    git(source, 'init', '--quiet');
    git(source, '-c', 'core.hooksPath=', 'fetch', '--quiet', '--depth=1',
      `https://github.com/${repository}.git`, ref === 'latest' ? 'refs/heads/main' : ref);
    const commit = git(source, 'rev-parse', 'FETCH_HEAD').trim();
    if (!/^[a-f0-9]{40}$/.test(commit) || (ref !== 'latest' && ref !== commit)) {
      throw new Error('Fetched revision does not match the requested SHA.');
    }
    const { files, lock } = await collectFiles(source, commit, config);
    const plan = planUpdate(root, files, previous);
    if (plan.conflicts.length) throw new Error(`Local edit conflicts; nothing changed:\n${plan.conflicts.join('\n')}`);
    if (mode === 'apply') {
      applyUpdate(root, files, lock, lockBytes);
    }
    console.log(json({ mode, from: previous?.commit ?? null, to: commit, upstreamVersion: lock.upstreamVersion,
      ...plan, sourceFiles: lock.sourceFiles }));
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`skills-update: ${error.message}`);
    process.exitCode = 1;
  });
}
