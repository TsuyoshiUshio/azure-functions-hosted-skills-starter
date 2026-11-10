import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const hosts = [
  ['copilot', '.github/hooks/hosted-skills-starter.json', 'copilot-cli'],
  ['claude', '.claude/settings.json', 'claude-code'],
  ['codex', '.codex/hooks.json', 'codex'],
];

function install(t, agent, hookPath) {
  const base = mkdtempSync(join(tmpdir(), 'bootstrap-hook-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const workspace = join(base, 'app');
  for (const row of readFileSync(join(root, 'cache', 'files.tsv'), 'utf8').trim().split('\n')) {
    const [scope, , source, target] = row.split('\t');
    if (!['common', 'preference-on', agent].includes(scope)
      || (!target.startsWith('.hosted-skills-starter/') && target !== hookPath)) continue;
    const output = join(workspace, target);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(join(root, 'cache', source), output);
  }
  const settings = JSON.parse(readFileSync(join(workspace, hookPath), 'utf8'));
  const hook = agent === 'copilot' ? settings.hooks.postToolUse[0]
    : settings.hooks.PostToolUse[0].hooks[0];
  const windows = process.platform === 'win32' && agent !== 'claude';
  const program = windows ? 'powershell.exe' : 'sh';
  const executable = process.platform === 'win32'
    ? spawnSync('where.exe', [program], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0]
    : '/bin/sh';
  assert.ok(executable, `Missing test shell: ${program}`);
  const command = agent === 'copilot' ? (windows ? hook.powershell : hook.bash)
    : (windows ? hook.commandWindows : hook.command);
  assert.ok(command);
  const args = windows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
  const cwd = join(workspace, 'src', 'nested');
  mkdirSync(cwd, { recursive: true });
  const marker = join(base, 'attempted-event.json');
  const environment = {
    ...process.env,
    STARTER_TEST_LOG: marker,
    NODE_OPTIONS: `--import=${pathToFileURL(join(root, 'tests', 'fixtures', 'offline-telemetry.mjs')).href}`,
  };
  for (const key of ['HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY',
    'AZURE_FUNCTIONS_SKILLS_COLLECT_TELEMETRY', 'AZURE_MCP_COLLECT_TELEMETRY', 'COPILOT_CLI']) {
    delete environment[key];
  }
  const run = (extra = {}) => {
    const result = spawnSync(executable, args, {
      cwd, env: { ...environment, ...extra }, timeout: 8000, encoding: 'utf8',
      input: JSON.stringify({ cwd: workspace, toolName: 'Skill',
        toolArgs: { skill: 'azure-functions-hosted-skills', prompt: 'private-test-input' } }),
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  };
  return { base, workspace, marker, run };
}

for (const [agent, hookPath, client] of hosts) {
  test(`cached ${agent} hook runs the installed collector offline and honors opt-outs`, t => {
    const { base, workspace, marker, run } = install(t, agent, hookPath);
    run();
    const event = JSON.parse(readFileSync(marker, 'utf8'));
    assert.equal(event.data.baseData.name, 'AzureFunctionsSkillsPluginExecuted');
    assert.deepEqual(event.data.baseData.properties, {
      clientName: client, pluginName: 'azure-functions-skills',
      eventType: 'skill_invocation', skillName: 'azure-functions-hosted-skills',
      distribution: 'hosted-skills-starter',
    });
    assert.equal(JSON.stringify(event).includes('private-test-input'), false);
    rmSync(marker);
    const preference = join(workspace, '.hosted-skills-starter', 'telemetry.config.json');
    writeFileSync(preference, '{"enabled":false}');
    run();
    assert.equal(existsSync(marker), false);
    writeFileSync(preference, '{"enabled":true}');
    run({ HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false' });
    assert.equal(existsSync(marker), false);
    mkdirSync(join(base, '.hosted-skills-starter'));
    writeFileSync(join(base, '.hosted-skills-starter', 'telemetry.config.json'), '{invalid');
    run();
    assert.equal(existsSync(marker), false);
  });

  test(`cached ${agent} hook exits harmlessly with no Node on PATH`, t => {
    const { marker, run } = install(t, agent, hookPath);
    run({ PATH: '' });
    assert.equal(existsSync(marker), false);
  });
}
