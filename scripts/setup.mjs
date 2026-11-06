import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  applyUpdate, checkWorkspace, hash, planUpdate, readCurrent, readLock,
} from './update-skills.mjs';
import { agents, clientNames, codexMcpBlock, hookGroup, json, skillDirectories, workspaceHostFiles } from './host-config.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
export const installationLock = '.hosted-skills-starter/install.json';
const begin = '# BEGIN hosted-skills-starter';
const end = '# END hosted-skills-starter';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function object(text, path) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (error) {
    throw new Error(`Invalid JSON configuration: ${path}; correct it before setup.`, { cause: error });
  }
  if (!record(parsed)) throw new Error(`Expected a JSON object: ${path}`);
  return parsed;
}

function replaceBlock(text, block, expectedHash) {
  const first = text.indexOf(begin);
  const last = text.indexOf(end);
  if (first < 0 && last < 0) return `${text}${text && !text.endsWith('\n') ? '\n' : ''}\n${block}`;
  if (first < 0 || last < first || text.indexOf(begin, first + begin.length) >= 0
    || text.indexOf(end, last + end.length) >= 0) throw new Error('Malformed starter block; merge it manually before setup.');
  if (expectedHash && hash(text.slice(first, last + end.length)) !== expectedHash) {
    throw new Error('Locally edited starter block requires a reviewed merge; nothing changed.');
  }
  return text.slice(0, first) + block.trimEnd() + text.slice(last + end.length);
}

function mergeToml(text, server, expectedHash) {
  const clean = replaceBlock(text, '').trimEnd();
  let section;
  for (const line of clean.split(/\r?\n/)) {
    section = line.match(/^\s*\[\[?\s*([^\]]+)\]/)?.[1]?.replace(/["'\s]/g, '') ?? section;
    if (section === 'mcp_servers' || section === 'mcp_servers.azure' || section?.startsWith('mcp_servers.azure.')
      || /^\s*["']?mcp_servers["']?\s*[=.]/.test(line)
      || /^\s*\[[^\]]*\\/.test(line) || /^[^=#]*\\[^=]*=/.test(line)) {
      throw new Error('Existing Codex azure MCP configuration requires a reviewed merge; nothing changed.');
    }
  }
  return replaceBlock(text, codexMcpBlock(server), expectedHash ?? hash(codexMcpBlock(server).trimEnd()));
}

function revision(directory) {
  if (!existsSync(join(directory, '.git'))) return null;
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const dirty = execFileSync('git', ['-C', directory, 'status', '--porcelain', '--untracked-files=normal'], options).trim();
  return dirty ? null : execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], options).trim();
}

export function buildSetup(workspace, agent, { source = sourceRoot, telemetry } = {}) {
  const directory = resolve(workspace);
  if (!agents.includes(agent)) throw new Error(`Choose an agent: ${agents.join(', ')}.`);
  if (!isAbsolute(workspace) || !existsSync(directory) || !lstatSync(directory).isDirectory()
    || directory === parse(directory).root) throw new Error('Choose an existing workspace directory, not a filesystem root.');
  const integrity = checkWorkspace(source);
  if (integrity.changed.length) throw new Error(`Distribution assets differ from their lock:\n${integrity.changed.join('\n')}`);
  const upstream = readLock(source);
  const instruction = readFileSync(join(source, 'assets', 'workspace-instructions.md'), 'utf8');
  const previous = readLock(directory, installationLock);
  if (previous?.agent && previous.agent !== agent) {
    throw new Error(`This workspace is configured for ${previous.agent}; changing agents requires a separately reviewed migration.`);
  }
  const expectedLockBytes = readCurrent(directory, installationLock)?.toString('utf8');
  const files = new Map();
  const mergeHashes = {};
  const config = object(readFileSync(join(source, 'plugin', '.mcp.json'), 'utf8'), 'plugin/.mcp.json');
  const server = config.mcpServers.azure;
  const hostFiles = workspaceHostFiles(agent, { mcp: { azure: server } }, instruction);
  const skillRoot = skillDirectories[agent];
  for (const path of Object.keys(upstream.files)) {
    if (path.startsWith('plugin/skills/')) {
      files.set(`${skillRoot}/${path.slice('plugin/skills/'.length)}`, readFileSync(join(source, path)));
    } else if (path.startsWith('plugin/hooks/runtime/')) {
      files.set(`.hosted-skills-starter/${path.slice('plugin/hooks/runtime/'.length)}`, readFileSync(join(source, path)));
    }
  }
  files.set('.hosted-skills-starter/upstream-LICENSE', readFileSync(join(source, 'plugin', 'upstream-LICENSE')));

  function merge(path, transform) {
    const current = readCurrent(directory, path);
    mergeHashes[path] = current === undefined ? null : hash(current);
    files.set(path, transform(current?.toString('utf8')));
  }

  function mcpJson(path, key) {
    merge(path, text => {
      const existing = text === undefined ? {} : object(text, path);
      if (existing[key] !== undefined && !record(existing[key])) throw new Error(`Invalid MCP server map: ${path}`);
      const servers = existing[key] ?? {};
      const desired = key === 'servers' ? { type: 'stdio', ...server } : server;
      if (servers.azure !== undefined && !isDeepStrictEqual(servers.azure, desired)
        && !isDeepStrictEqual(servers.azure, previous?.mcp)) {
        throw new Error(`Existing azure MCP server requires a reviewed merge: ${path}`);
      }
      existing[key] = { ...servers, azure: desired };
      return json(existing);
    });
  }

  const blocks = {};
  if (agent === 'codex') {
    blocks['.codex/config.toml'] = hash(codexMcpBlock(server).trimEnd());
    merge('.codex/config.toml', text => mergeToml(text ?? '', server, previous?.blocks?.['.codex/config.toml']));
  }
  else mcpJson(agent === 'vscode' ? '.vscode/mcp.json' : '.mcp.json',
    agent === 'vscode' ? 'servers' : 'mcpServers');

  const group = hookGroup(agent);
  if (agent === 'claude' || agent === 'codex') {
    const path = agent === 'claude' ? '.claude/settings.json' : '.codex/hooks.json';
    merge(path, text => {
      const settings = text === undefined ? {} : object(text, path);
      if (settings.hooks !== undefined && !record(settings.hooks)) throw new Error(`Invalid hooks object: ${path}`);
      settings.hooks ??= {};
      const existing = settings.hooks.PostToolUse ?? [];
      if (!Array.isArray(existing)) throw new Error(`Invalid PostToolUse hooks: ${path}`);
      const unrelated = existing.filter(item => {
        if (!JSON.stringify(item).includes('.hosted-skills-starter')) return true;
        if (!isDeepStrictEqual(item, previous?.hook) && !isDeepStrictEqual(item, group)) {
          throw new Error(`Locally edited starter hook requires a reviewed merge: ${path}`);
        }
        return false;
      });
      settings.hooks.PostToolUse = [...unrelated, group];
      return json(settings);
    });
  } else {
    const path = '.github/hooks/hosted-skills-starter.json';
    files.set(path, hostFiles.get(path));
  }
  merge('.hosted-skills-starter/telemetry.config.json', text => {
    const current = text === undefined ? { enabled: true } : object(text, 'telemetry.config.json');
    if (typeof current.enabled !== 'boolean') throw new Error('Telemetry enabled must be true or false.');
    return json({ ...current, ...(telemetry === false ? { enabled: false } : {}) });
  });
  const instructionPath = agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
  const block = hostFiles.get(instructionPath);
  blocks[instructionPath] = hash(block.trimEnd());
  merge(instructionPath, text => {
    if (previous?.files?.[instructionPath] && (text === undefined
      || (previous?.blocks?.[instructionPath] && !text.includes(begin)))) {
      throw new Error(`Locally removed starter instructions require a reviewed merge: ${instructionPath}`);
    }
    return replaceBlock(text ?? '', block,
      previous?.blocks?.[instructionPath] ?? blocks[instructionPath]);
  });
  if (agent === 'copilot' || agent === 'vscode') {
    files.set('.github/instructions/hosted-skills-starter.instructions.md',
      hostFiles.get('.github/instructions/hosted-skills-starter.instructions.md'));
  }

  const baseline = { ...previous, files: { ...previous?.files } };
  for (const [path, digest] of Object.entries(mergeHashes)) {
    if (digest === null) delete baseline.files[path];
    else baseline.files[path] = digest;
  }
  const plan = planUpdate(directory, files, baseline);
  const manifest = {
    schemaVersion: 1, upstream: upstream.upstream, commit: upstream.commit,
    upstreamVersion: upstream.upstreamVersion, agent, starterRevision: revision(source),
    mcp: agent === 'vscode' ? { type: 'stdio', ...server } : server,
    hook: group, blocks, files: Object.fromEntries([...files].map(([path, bytes]) => [path, hash(bytes)])),
  };
  const currentHashes = {};
  for (const path of new Set([...Object.keys(previous?.files ?? {}), ...files.keys()])) {
    const current = readCurrent(directory, path);
    currentHashes[path] = current === undefined ? null : hash(current);
  }
  const token = hash(json({ directory, manifest, currentHashes, expectedLockBytes: expectedLockBytes ?? null }));
  return { directory, agent, files, manifest, expectedLockBytes, mergeHashes, currentHashes, plan, token };
}

export function applySetup(setup, expectedToken) {
  if (expectedToken !== setup.token) throw new Error('Setup plan changed; preview again and approve the new plan token.');
  for (const [path, digest] of Object.entries(setup.currentHashes)) {
    const current = readCurrent(setup.directory, path);
    if ((current === undefined ? null : hash(current)) !== digest) {
      throw new Error(`Concurrent edit detected: ${path}; preview again.`);
    }
  }
  if (setup.plan.conflicts.length) throw new Error(`Local edit conflicts; nothing changed:\n${setup.plan.conflicts.join('\n')}`);
  return applyUpdate(setup.directory, setup.files, setup.manifest, setup.expectedLockBytes,
    undefined, installationLock, setup.mergeHashes);
}

async function main(args = process.argv.slice(2)) {
  let workspace;
  let agent;
  let apply = false;
  let expected;
  let telemetry;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) workspace = args[++i];
    else if (args[i] === '--agent' && args[i + 1]) agent = args[++i];
    else if (args[i] === '--expect-plan' && args[i + 1]) expected = args[++i];
    else if (args[i] === '--apply') apply = true;
    else if (args[i] === '--no-telemetry') telemetry = false;
    else throw new Error(`Unknown or incomplete setup argument: ${args[i]}`);
  }
  if (!workspace || !agent) throw new Error('Use --workspace <absolute-path> --agent <claude|codex|copilot|vscode>.');
  const setup = buildSetup(workspace, agent, { telemetry });
  if (apply) {
    applySetup(setup, expected);
    if (setup.plan.changes.length) {
      try {
        spawnSync(process.execPath, [
          join(sourceRoot, 'plugin', 'hooks', 'runtime', 'telemetry.mjs'),
          'setup', clientNames[agent], '--dir', setup.directory,
        ], { timeout: 3000, stdio: 'ignore', windowsHide: true });
      } catch {
        // Telemetry startup/delivery must not change a successful installation.
      }
    }
  }
  console.log(json({
    mode: apply ? 'apply' : 'preview', workspace: setup.directory, agent,
    upstreamCommit: setup.manifest.commit, starterRevision: setup.manifest.starterRevision,
    planToken: setup.token, ...setup.plan,
    telemetry: 'Best-effort App Insights events tagged distribution=hosted-skills-starter; opt out with --no-telemetry or HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY=false.',
  }));
  if (setup.plan.conflicts.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`starter-setup: ${error.message}`);
    process.exitCode = 1;
  });
}
