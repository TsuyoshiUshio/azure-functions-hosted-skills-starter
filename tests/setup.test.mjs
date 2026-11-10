import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { applySetup, buildSetup, installationLock } from '../scripts/setup.mjs';
import { agents, clientNames, hookCommand, skillDirectories, workspaceHostFiles } from '../scripts/host-config.mjs';
import { hash } from '../scripts/update-skills.mjs';

const root = resolve(import.meta.dirname, '..');

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), "starter setup's test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function put(directory, path, text) {
  const full = join(directory, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function read(directory, path) { return readFileSync(join(directory, path), 'utf8'); }

for (const agent of agents) {
  test(`${agent} setup previews without writes, installs only its host, and is idempotent`, t => {
    const directory = workspace(t);
    const setup = buildSetup(directory, agent, { telemetry: false });
    assert.deepEqual(readdirSync(directory), []);
    assert.deepEqual(setup.plan.conflicts, []);
    assert.equal(setup.plan.changes.length > 30, true);
    const selected = skillDirectories[agent];
    assert.equal(setup.files.has(`${selected}/azure-functions-hosted-skills/SKILL.md`), true);
    for (const other of new Set(Object.values(skillDirectories))) {
      if (other !== selected) assert.equal([...setup.files.keys()].some(path => path.startsWith(`${other}/`)), false);
    }
    for (const forbidden of ['package.json', 'package-lock.json', 'node_modules', 'plugin/', 'tests/', 'scripts/', '.devcontainer']) {
      assert.equal([...setup.files.keys()].some(path => path.startsWith(forbidden)), false, forbidden);
    }
    applySetup(setup, setup.token);
    const state = JSON.parse(read(directory, installationLock));
    assert.equal(state.agent, agent);
    assert.equal(state.commit.length, 40);
    assert.equal(JSON.parse(read(directory, '.hosted-skills-starter/telemetry.config.json')).enabled, false);
    const again = buildSetup(directory, agent);
    assert.deepEqual(again.plan, { changes: [], conflicts: [], preserved: [] });
    applySetup(again, again.token);
    assert.equal(read(directory, installationLock), JSON.stringify(state, null, 2) + '\n');
    assert.throws(() => buildSetup(directory, agent === 'claude' ? 'codex' : 'claude'), /changing agents/);
  });
}

for (const agent of agents) {
  test(`${agent} native instructions preserve user content and select local skills without a Canvas handoff`, t => {
    const directory = workspace(t);
    const path = agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
    const userRules = '# My project\n\nPreserve my existing instructions.\n';
    put(directory, path, userRules);
    const setup = buildSetup(directory, agent);
    applySetup(setup, setup.token);
    const instructions = read(directory, path);
    assert.ok(instructions.startsWith(userRules));
    assert.ok(instructions.includes(`${skillDirectories[agent]}/azure-functions-hosted-skills/SKILL.md`));
    assert.equal(instructions.includes('{{skillRoot}}'), false);
    assert.match(instructions, /Prefer these\s+workspace\/distribution-local files over same-named skills/);
    assert.match(instructions, /Open azure-functions-hosted-skills-canvas only when the user explicitly asks/);
    assert.match(instructions, /Fresh setup defaults telemetry to enabled without a telemetry-choice question/);
    assert.equal(JSON.parse(read(directory, '.hosted-skills-starter/telemetry.config.json')).enabled, true);
    assert.equal(setup.manifest.blocks[path], hash(instructions.slice(
      instructions.indexOf('# BEGIN hosted-skills-starter'),
      instructions.indexOf('# END hosted-skills-starter') + '# END hosted-skills-starter'.length)));
    if (agent === 'copilot' || agent === 'vscode') {
      assert.match(read(directory, '.github/instructions/hosted-skills-starter.instructions.md'),
        /workspace-root `AGENTS.md`/);
    }
    put(directory, path, instructions + '\nA later user rule.\n');
    const again = buildSetup(directory, agent);
    assert.deepEqual(again.plan, { changes: [], conflicts: [], preserved: [] });
    applySetup(again, again.token);
    assert.ok(read(directory, path).endsWith('A later user rule.\n'));
    put(directory, '.hosted-skills-starter/telemetry.config.json', '{"enabled":false}\n');
    const optedOut = buildSetup(directory, agent);
    applySetup(optedOut, optedOut.token);
    assert.equal(JSON.parse(read(directory, '.hosted-skills-starter/telemetry.config.json')).enabled, false);
  });
}

test('locally deleted native instructions or owned blocks require a reviewed merge', t => {
  for (const agent of agents) {
    for (const removeFile of [false, true]) {
      const directory = workspace(t);
      const path = agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
      const setup = buildSetup(directory, agent);
      applySetup(setup, setup.token);
      if (removeFile) rmSync(join(directory, path));
      else put(directory, path, '# Keep my project instructions.\n');
      const state = read(directory, installationLock);
      assert.throws(() => buildSetup(directory, agent), /Locally removed starter instructions.*reviewed merge/);
      assert.equal(read(directory, installationLock), state);
      if (removeFile) assert.equal(existsSync(join(directory, path)), false);
      else assert.equal(read(directory, path), '# Keep my project instructions.\n');
    }
  }
});

test('Claude legacy rule migration removes only unchanged owned guidance and preserves CLAUDE.md', t => {
  for (const edited of [false, true]) {
    const directory = workspace(t);
    const setup = buildSetup(directory, 'claude');
    applySetup(setup, setup.token);
    const path = '.claude/rules/hosted-skills-starter.md';
    const legacy = 'Previously installed starter guidance.\n';
    const userRules = '# Existing Claude instructions\n';
    put(directory, path, edited ? legacy + 'A local edit.\n' : legacy);
    put(directory, 'CLAUDE.md', userRules);
    const state = JSON.parse(read(directory, installationLock));
    delete state.files['CLAUDE.md'];
    delete state.blocks['CLAUDE.md'];
    state.files[path] = hash(legacy);
    put(directory, installationLock, JSON.stringify(state, null, 2) + '\n');
    const upgrade = buildSetup(directory, 'claude');
    if (edited) {
      assert.ok(upgrade.plan.conflicts.includes(path));
      assert.throws(() => applySetup(upgrade, upgrade.token), /Local edit conflicts/);
      assert.equal(read(directory, 'CLAUDE.md'), userRules);
      assert.equal(read(directory, path), legacy + 'A local edit.\n');
    } else {
      assert.ok(upgrade.plan.changes.some(change => change.path === path && change.action === 'delete'));
      applySetup(upgrade, upgrade.token);
      assert.equal(existsSync(join(directory, path)), false);
      assert.ok(read(directory, 'CLAUDE.md').startsWith(userRules));
      assert.deepEqual(buildSetup(directory, 'claude').plan.changes, []);
    }
  }
});

test('JSON setup preserves other MCP servers, hooks and user settings across later edits', t => {
  const directory = workspace(t);
  put(directory, '.mcp.json', '{"mcpServers":{"mine":{"command":"custom"}},"custom":true}');
  put(directory, '.claude/settings.json',
    '{"permissions":{"allow":[]},"hooks":{"PostToolUse":[{"hooks":[{"type":"command","command":"echo mine"}]}]}}');
  let setup = buildSetup(directory, 'claude');
  applySetup(setup, setup.token);
  let mcp = JSON.parse(read(directory, '.mcp.json'));
  mcp.mcpServers.later = { command: 'another' };
  put(directory, '.mcp.json', JSON.stringify(mcp));
  const settings = JSON.parse(read(directory, '.claude/settings.json'));
  settings.hooks.PostToolUse.push({ hooks: [{ type: 'command', command: 'echo later' }] });
  settings.userSetting = 'keep';
  put(directory, '.claude/settings.json', JSON.stringify(settings));
  setup = buildSetup(directory, 'claude');
  assert.deepEqual(setup.plan.conflicts, []);
  applySetup(setup, setup.token);
  mcp = JSON.parse(read(directory, '.mcp.json'));
  assert.equal(mcp.custom, true);
  assert.equal(mcp.mcpServers.mine.command, 'custom');
  assert.equal(mcp.mcpServers.later.command, 'another');
  assert.equal(mcp.mcpServers.azure.env.AZURE_MCP_COLLECT_TELEMETRY, 'false');
  assert.equal(JSON.parse(read(directory, '.claude/settings.json')).hooks.PostToolUse.length, 3);
  assert.equal(JSON.parse(read(directory, '.claude/settings.json')).userSetting, 'keep');
});

test('Codex setup preserves existing instructions and TOML servers, producing parseable native configuration', t => {
  const directory = workspace(t);
  const instructions = '# My project\n\nPreserve this rule.\n';
  const toml = 'model = "local-choice"\n\n[mcp_servers.mine]\ncommand = "custom"\n';
  put(directory, 'AGENTS.md', instructions);
  put(directory, '.codex/config.toml', toml);
  const setup = buildSetup(directory, 'codex');
  applySetup(setup, setup.token);
  assert.ok(read(directory, 'AGENTS.md').startsWith(instructions));
  assert.ok(read(directory, '.codex/config.toml').startsWith(toml));
  const parser = spawnSync('python', ['-c',
    'import json,sys,tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))'], {
    input: read(directory, '.codex/config.toml'), encoding: 'utf8',
  });
  if (parser.error?.code === 'ENOENT') return t.diagnostic('Python unavailable; native TOML parse covered separately when available.');
  assert.equal(parser.status, 0, parser.stderr);
  const parsed = JSON.parse(parser.stdout);
  assert.equal(parsed.mcp_servers.mine.command, 'custom');
  assert.equal(parsed.mcp_servers.azure.command, 'npx');
  assert.equal(parsed.model, 'local-choice');
  put(directory, 'AGENTS.md', read(directory, 'AGENTS.md') + '\nA later user rule.\n');
  assert.deepEqual(buildSetup(directory, 'codex').plan.conflicts, []);
});

test('malformed JSON, conflicting Azure servers and unknown TOML structures fail before any writes', t => {
  for (const [agent, path, text] of [
    ['claude', '.mcp.json', '{invalid'],
    ['claude', '.mcp.json', '{"token":private-secret}'],
    ['vscode', '.vscode/mcp.json', '{"servers":{"azure":{"command":"mine"}}}'],
    ['codex', '.codex/config.toml', '[mcp_servers.azure]\ncommand = "mine"'],
    ['codex', '.codex/config.toml', '[mcp_servers]\nazure = { command = "mine" }'],
    ['codex', '.codex/config.toml', 'mcp_servers.azure.command = "mine"'],
    ['codex', '.codex/config.toml', '[mcp_servers."\\u0061zure"]\ncommand = "mine"'],
    ['codex', '.codex/config.toml', '# BEGIN hosted-skills-starter\npartial'],
    ['claude', '.claude/settings.json', '{"hooks":[]}'],
  ]) {
    const directory = workspace(t);
    put(directory, path, text);
    assert.throws(() => buildSetup(directory, agent), error => {
      assert.equal(error.message.includes('private-secret'), false);
      return true;
    });
    assert.equal(read(directory, path), text);
    assert.equal(existsSync(join(directory, installationLock)), false);
    assert.equal(existsSync(join(directory, '.hosted-skills-starter/telemetry.mjs')), false);
  }
});

test('edited managed blocks and hooks are never silently replaced', t => {
  for (const [agent, path, change] of [
    ['codex', 'AGENTS.md', text => text.replace('Never download', 'Please download')],
    ['claude', 'CLAUDE.md', text => text.replace('Never download', 'Please download')],
    ['copilot', 'AGENTS.md', text => text.replace('Never download', 'Please download')],
    ['vscode', 'AGENTS.md', text => text.replace('Never download', 'Please download')],
    ['codex', '.codex/config.toml', text => text.replace('command = "npx"', 'command = "mine"')],
    ['claude', '.claude/settings.json', text => text.replace('2500', '5000').replace('node -e', 'custom-node -e')],
  ]) {
    const directory = workspace(t);
    const setup = buildSetup(directory, agent);
    applySetup(setup, setup.token);
    const modified = change(read(directory, path));
    put(directory, path, modified);
    assert.throws(() => buildSetup(directory, agent), /reviewed merge/);
    assert.equal(read(directory, path), modified);
  }
});

test('plan tokens, concurrent edits, deleted assets and symlinks are guarded', t => {
  const directory = workspace(t);
  const first = buildSetup(directory, 'copilot', { telemetry: false });
  assert.throws(() => applySetup(first, 'stale'), /plan changed/);
  assert.equal(existsSync(join(directory, installationLock)), false);
  put(directory, '.mcp.json', '{"mcpServers":{"mine":{}}}');
  assert.throws(() => applySetup(first, first.token), /Concurrent edit/);
  const second = buildSetup(directory, 'copilot', { telemetry: false });
  assert.notEqual(first.token, second.token);
  applySetup(second, second.token);
  const asset = '.github/skills/azure-functions-hosted-skills/SKILL.md';
  rmSync(join(directory, asset));
  assert.ok(buildSetup(directory, 'copilot').plan.conflicts.includes(asset));
  const linked = workspace(t);
  const outside = workspace(t);
  symlinkSync(outside, join(linked, '.hosted-skills-starter'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => buildSetup(linked, 'copilot'), /symlink/);
});

test('actual native launchers locate their runtime from nested non-Git workspaces, including quoted paths', t => {
  for (const agent of agents) {
    const directory = workspace(t);
    const setup = buildSetup(directory, agent, { telemetry: false });
    applySetup(setup, setup.token);
    put(directory, '.hosted-skills-starter/telemetry.mjs',
      "import {writeFileSync} from 'node:fs'; export async function runHook(client) {writeFileSync(process.env.STARTER_TEST_LOG,client);}");
    const nested = join(directory, 'app', 'nested');
    mkdirSync(nested, { recursive: true });
    const marker = join(directory, 'invoked.txt');
    const windows = process.platform === 'win32';
    const result = spawnSync(windows ? 'powershell.exe' : 'bash',
      windows ? ['-NoProfile', '-NonInteractive', '-Command', hookCommand(agent, { windows })]
        : ['-c', hookCommand(agent)], {
        cwd: nested, input: '{}', encoding: 'utf8', timeout: 10000,
        env: { ...process.env, STARTER_TEST_LOG: marker, HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false' },
      });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(marker, 'utf8'), clientNames[agent]);
  }
});

test('actual CLI setup binds preview/apply and keeps telemetry disabled without npm or Azure', t => {
  const directory = workspace(t);
  const args = [join(root, 'scripts', 'setup.mjs'), '--agent', 'codex', '--workspace', directory, '--no-telemetry'];
  const options = { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false' } };
  const preview = spawnSync(process.execPath, args, options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(readdirSync(directory), []);
  const plan = JSON.parse(preview.stdout);
  const apply = spawnSync(process.execPath, [...args, '--apply', '--expect-plan', plan.planToken], options);
  assert.equal(apply.status, 0, apply.stderr);
  assert.equal(JSON.parse(apply.stdout).mode, 'apply');
  assert.equal(JSON.parse(read(directory, '.hosted-skills-starter/telemetry.config.json')).enabled, false);
  assert.equal(existsSync(join(directory, 'node_modules')), false);
});

test('start.md selects OS and agent once and delegates to README installers with JSON', () => {
  const prompt = read(root, 'start.md');
  const snippets = [...prompt.matchAll(/```(\w+)\n([^\n]+)\n```/g)];
  assert.deepEqual(snippets.map(([, language]) => language), ['powershell', 'sh']);
  const readme = read(root, 'README.md');
  const oneLiners = readme.slice(readme.indexOf('### Method 2:'), readme.indexOf('### Method 3:'));
  const entries = [...oneLiners.matchAll(/<details>\s*<summary>([^<]+)<\/summary>([\s\S]*?)<\/details>/g)];
  for (const [index, [, , content]] of entries.entries()) {
    const agent = ['copilot', 'claude', 'codex'][index];
    const commands = [...content.matchAll(/```(\w+)\n([^\n]+)\n```/g)];
    assert.equal(snippets[0][2].replace('-Agent copilot -Json', `-Agent ${agent}`), commands[0][2]);
    assert.equal(snippets[1][2].replace('--agent copilot --json)', `--agent ${agent})`), commands[1][2]);
  }
  assert.match(prompt, /Windows, macOS, or Linux/);
  assert.match(prompt, /execution host, not the desktop OS/);
  assert.match(prompt, /execution context already supplied/);
  assert.match(prompt, /one native OS query/);
  assert.match(prompt, /Run exactly one matching command with JSON output/);
  assert.match(prompt, /Do not first\s+clone the repository/);
  assert.match(prompt, /not another inspection loop/);
  assert.doesNotMatch(snippets.map(([, , code]) => code).join('\n'), /-Destination|--destination|setup\.mjs|git clone/);
  assert.doesNotMatch(prompt, /--expect-plan/);
  assert.match(prompt, /workspace setup without an app\s+template/);
  assert.match(prompt, /docs\/setup\.md#agent-led-workspace-integration/);
});

test('bootstrap handoff uses reported readiness and missing tools without claiming runtime validation', () => {
  const prompt = read(root, 'start.md');
  for (const field of ['authorReady', 'destination', 'agent', 'starterSource', 'skills', 'toolsDetected',
    'localRun', 'deployment', 'python3', 'python', 'func', 'azurite', 'azd', 'az', 'node', 'telemetry']) {
    assert.ok(prompt.includes(`\`${field}\``), field);
  }
  assert.match(prompt, /nonzero exit, invalid\/missing JSON/);
  assert.match(prompt, /Read stderr too/);
  assert.match(prompt, /Both `python3` and `python` are false/);
  assert.match(prompt, /selected OS/);
  assert.match(prompt, /CLI absence does not rule out an existing container/);
  assert.match(prompt, /Missing optional tools do not undo Author-ready/);
  assert.match(prompt, /not version, service, credential, or model\s+validation/);
  assert.match(prompt, /do not force, choose a different\s+target, retry automatically/i);
  assert.match(prompt, /do not install Node or other tools automatically/i);
  assert.match(prompt, /Hosted Skills setup complete!/);
  assert.match(prompt, /go straight to the intent question/);
  assert.match(prompt, /ask one question: what the user wants to build/);
  assert.match(prompt, /let that skill own planning, clarifying questions,\s+approvals, and implementation/);
  assert.match(prompt, /Do not open azure-functions-hosted-skills-canvas unless the user explicitly asks/);
  assert.match(prompt, /all six repository skills/);
  assert.match(prompt, /Migration still requires an explicit use request/);
  assert.match(prompt, /no second installation or discovery scan/);
  assert.match(prompt, /Fresh setup enables.*telemetry hooks without a choice question/);
  assert.match(prompt, /explicit disable request.*`-NoTelemetry`/);
  assert.match(prompt, /ancestor\/environment opt-outs still take precedence/);
});

test('explicit workspace-only integration retains its reviewed merge and verification contract', () => {
  const guide = read(root, 'docs/setup.md');
  assert.match(guide, /Agent-led workspace integration/);
  assert.match(guide, /preview.*approved/is);
  assert.match(guide, /--expect-plan/);
  assert.match(guide, /continue with agent-led setup/i);
  assert.match(guide, /Definition of done/);
  assert.match(guide, /merge or intentional replacement/);
  assert.match(guide, /Temporary downloads.*cleaned/is);
  assert.match(guide, /Do not ask a telemetry-choice\s+question/);
  assert.match(guide, /do not modify installer internals to omit MCP/);
  assert.match(read(root, 'docs/agent-setup.md'), /Definition of done in `docs\/setup.md`/);
});

test('agent-led blueprints match a fresh scripted install for every host', t => {
  const config = JSON.parse(read(root, 'starter.config.json'));
  for (const agent of agents) {
    const setup = buildSetup(workspace(t), agent, { telemetry: false });
    for (const [path, content] of workspaceHostFiles(agent, config)) {
      assert.equal(read(root, `assets/setup/${agent}/${path}`), content);
      if (!path.endsWith('.json')) {
        assert.equal(setup.files.get(path).trim(), content.trim());
      } else {
        assert.deepEqual(JSON.parse(setup.files.get(path)), JSON.parse(content));
      }
    }
  }
});

test('staging distribution references and packaged guidance use the current source consistently', () => {
  const repository = 'TsuyoshiUshio/azure-functions-hosted-skills-starter';
  for (const path of ['README.md', 'start.md', 'setup.ps1', 'setup.sh', 'docs/setup.md',
    'docs/development.md', 'scripts/host-config.mjs', 'skills/skills-update/SKILL.md',
    'plugin/skills/skills-update/SKILL.md', 'plugin/.claude-plugin/plugin.json',
    'plugin/.codex-plugin/plugin.json', 'plugin/plugin.json']) {
    const text = read(root, path);
    assert.ok(text.includes(repository), path);
    assert.equal(text.includes('Azure-Samples/azure-functions-hosted-skills-starter'), false, path);
  }
  assert.match(read(root, 'plugin/AGENTS.md'), /`skills\/azure-functions-hosted-skills\/SKILL.md`/);
  assert.equal(read(root, 'plugin/CLAUDE.md'), '@AGENTS.md\n');
  const readme = read(root, 'README.md');
  assert.match(readme, /with the cached template in this directory/);
  assert.match(readme, /Use the one-liner for your OS and coding agent\. Do not open a Canvas\./);
  assert.ok(read(root, 'docs/development.md').includes(`${repository}/issues/1`));
});

test('customer README stays brief and links the supplied banner and focused guides', () => {
  const readme = read(root, 'README.md');
  assert.ok(readme.split('\n').length <= 180);
  assert.ok(readme.split(/\s+/).length <= 600);
  const shortcut = readme.indexOf('https://aka.ms/hosted-skills-starter ');
  assert.ok(shortcut >= 0 && shortcut < readme.indexOf('### Method 2:'));
  assert.match(readme, /No Node.js required for bootstrap/);
  assert.match(readme, /azure-functions-hosted-skills-migrate/);
  const sections = ['## Getting started', '### Method 1:', '### Method 2:', '### Method 3:', '## Developer guide',
    '<summary>Disable telemetry</summary>'].map(text => readme.indexOf(text));
  assert.ok(sections.every(index => index >= 0));
  assert.deepEqual(sections, [...sections].sort((a, b) => a - b));
  assert.match(readme, /<details>\s*<summary>Disable telemetry<\/summary>/);
  assert.doesNotMatch(readme, /^## Disable telemetry/m);
  assert.match(readme, /<sub>This starter bundles the Hosted Skills-related subset of/);
  assert.ok(readme.includes('https://github.com/Azure/azure-functions-skills'));
  assert.match(readme, /without installing this subset again\.<\/sub>/);
  assert.ok(readme.indexOf('## Special thanks') > readme.indexOf('<summary>Disable telemetry</summary>'));
  assert.ok(readme.includes('[shibayan](https://github.com/shibayan)'));
  assert.ok(readme.includes('https://github.com/shibayan/azure-functions-hosted-skills-starter'));
  for (const path of ['docs/images/hosted-skills-banner.png', 'docs/setup.md', 'docs/development.md']) {
    assert.ok(readme.includes(path));
    assert.ok(existsSync(join(root, path)), path);
  }
  const guide = read(root, 'docs/agent-setup.md');
  for (const term of ['JSONC', 'deferred', 'preservedHashes', 'SHA-256', 'cleanup', 'Recovery']) {
    assert.ok(guide.toLowerCase().includes(term.toLowerCase()), term);
  }
});

test('README provides one-copy latest-main commands for each agent and OS', () => {
  const readme = read(root, 'README.md');
  const oneLiners = readme.slice(readme.indexOf('### Method 2:'), readme.indexOf('### Method 3:'));
  const entries = [...oneLiners.matchAll(/<details>\s*<summary>([^<]+)<\/summary>([\s\S]*?)<\/details>/g)];
  assert.deepEqual(entries.map(([, title]) => title), ['GitHub Copilot', 'Claude Code', 'Codex']);
  const repository = 'https://raw.githubusercontent.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/main';
  for (const [index, [, , content]] of entries.entries()) {
    const agent = ['copilot', 'claude', 'codex'][index];
    const snippets = [...content.matchAll(/```(\w+)\n([^\n]+)\n```/g)];
    assert.deepEqual(snippets.map(([, language]) => language), ['powershell', 'sh']);
    const powershell = snippets[0][2];
    const shell = snippets[1][2];
    assert.ok(powershell.includes(`${repository}/install.ps1`));
    assert.ok(powershell.endsWith(`-Agent ${agent}`));
    assert.ok(shell.includes(`${repository}/install.sh`));
    assert.ok(shell.endsWith(`--agent ${agent})`));
    assert.ok(shell.includes('trap \'rm -f "$installer"\' EXIT'));
    assert.doesNotMatch(content, /<PUBLISHED_COMMIT_SHA>|-Ref |--ref |[Aa]gent all|-Destination|--destination/);
  }
  assert.ok(oneLiners.includes('new app with its template applied'));
  assert.ok(oneLiners.includes('**current directory**'));
  assert.ok(!oneLiners.includes('my-hosted-skill'));
  assert.ok(oneLiners.includes('existing workspace without app creation'));
  assert.ok(oneLiners.includes('docs/bootstrap.md'));
});

test('bootstrap hands off to creation while workspace launchers also offer migration', () => {
  const examples = text => [...text.matchAll(/^> (.+(?:\n> .+)*)/gm)]
    .map(match => match[1].replace(/\n> /g, ' '));
  const prompts = examples(read(root, 'README.md'));
  assert.equal(prompts.length, 2);
  assert.deepEqual(examples(read(root, 'start.md')), [prompts[0]]);
  assert.match(read(root, 'README.md'), /Or explicitly request migration/);
  assert.match(prompts[0], /Every Monday at 08:00 JST/);
  assert.match(prompts[0], /past seven days/);
  assert.match(prompts[0], /official Microsoft sources, include source links/);
  assert.match(prompts[0], /existing Teams thread/);
  assert.match(prompts[1], /\.github\/workflows\/weekly-releases\.yml/);
  assert.match(prompts[1], /every Friday at 09:00 JST/);
  assert.match(prompts[1], /Preserve its repository list, schedule, and destination/);
  for (const path of ['setup.ps1', 'setup.sh']) {
    const launcher = read(root, path);
    for (const prompt of prompts) {
      assert.match(prompt, /do not deploy or send messages yet/);
      assert.ok(launcher.includes(prompt), path);
    }
    assert.ok(launcher.includes('https://aka.ms/hosted-skills-starter and set up'), path);
  }
});
