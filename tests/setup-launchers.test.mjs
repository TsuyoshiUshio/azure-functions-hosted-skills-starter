import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hookCommand } from '../scripts/host-config.mjs';

const root = resolve(import.meta.dirname, '..');
const windows = process.platform === 'win32';
function locate(name) {
  const found = spawnSync(windows ? 'where.exe' : 'which', [name], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim().split(/\r?\n/)[0] : undefined;
}
const shells = [
  { name: 'Bash', executable: locate('bash'), file: 'setup.sh', args: [],
    flags: { agent: '--agent', source: '--source', preview: '--preview', telemetry: '--no-telemetry' } },
  { name: 'PowerShell', executable: locate(windows ? 'powershell.exe' : 'pwsh'), file: 'setup.ps1',
    args: ['-NoProfile', '-File'], flags: { agent: '-Agent', source: '-Source', preview: '-Preview', telemetry: '-NoTelemetry' } },
];
let fixture;
let revision;

function directory(t) {
  const path = mkdtempSync(join(tmpdir(), "starter launcher's test-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'starter-launcher-source-'));
  for (const path of ['scripts', 'skills', 'plugin', 'assets', '.agents', '.claude-plugin',
    'skills.lock.json', 'starter.config.json', '.gitattributes']) {
    cpSync(join(root, path), join(fixture, path), { recursive: true });
  }
  const git = (...args) => execFileSync('git', ['-C', fixture, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet');
  git('-c', 'core.autocrlf=false', 'add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m',
    'Fixture\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>');
  revision = git('rev-parse', 'HEAD').trim();
});
after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

for (const shell of shells) {
  test(`${shell.name} workspace hooks are harmless without Node`, { skip: !shell.executable }, t => {
    const path = directory(t);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
    const args = shell.file.endsWith('.ps1')
      ? ['-NoProfile', '-NonInteractive', '-Command', hookCommand('codex', { windows: true })]
      : ['-c', hookCommand('claude')];
    const result = spawnSync(shell.executable, args, {
      cwd: path, encoding: 'utf8', timeout: 15000, input: '{}',
      env: { ...env, PATH: path },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(path), []);
  });

  test(`${shell.name} missing Node hands off before any staging or workspace writes`, { skip: !shell.executable }, t => {
    const path = directory(t);
    const bin = join(path, 'empty-bin');
    const workspace = join(path, 'workspace');
    const staging = join(path, 'staging');
    for (const child of [bin, workspace, staging]) mkdirSync(child);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
    const result = spawnSync(shell.executable,
      [...shell.args, join(root, shell.file), shell.flags.agent, 'copilot'], {
        cwd: workspace, encoding: 'utf8', timeout: 15000,
        env: { ...env, PATH: bin, TMP: staging, TEMP: staging, TMPDIR: staging },
      });
    assert.equal(result.status, 2, result.stderr + result.stdout);
    assert.match(result.stdout + result.stderr, /https:\/\/aka\.ms\/hosted-skills-starter\s/);
    assert.match(result.stdout + result.stderr, /No files were changed/);
    assert.doesNotMatch(result.stdout + result.stderr, /setup complete!/i);
    assert.deepEqual(readdirSync(workspace), []);
    assert.deepEqual(readdirSync(staging), []);
  });

  for (const mode of ['preview', 'decline', 'apply', 'conflict']) {
    test(`${shell.name} remote ${mode} uses pinned offline source and cleans staging`, { skip: !shell.executable }, t => {
      const path = directory(t);
      const workspace = join(path, 'workspace');
      const staging = join(path, 'staging');
      mkdirSync(workspace);
      mkdirSync(staging);
      const launcher = join(path, shell.file);
      cpSync(join(root, shell.file), launcher);
      if (mode === 'conflict') writeFileSync(join(workspace, '.mcp.json'), '{invalid');
      const args = [...shell.args, launcher, shell.flags.agent, 'copilot', shell.flags.telemetry];
      if (mode === 'preview') args.push(shell.flags.preview);
      const result = spawnSync(shell.executable, args, {
        cwd: workspace, encoding: 'utf8', timeout: 30000,
        input: mode === 'apply' ? 'y\n' : 'n\n',
        env: {
          ...process.env, TMP: staging, TEMP: staging, TMPDIR: staging,
          HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false',
          GIT_ALLOW_PROTOCOL: 'file', GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: `url.${pathToFileURL(fixture).href}.insteadOf`,
          GIT_CONFIG_VALUE_0: 'https://github.com/Azure-Samples/azure-functions-hosted-skills-starter.git',
        },
      });
      assert.equal(result.status, mode === 'conflict' ? 1 : 0, result.stderr + result.stdout);
      assert.deepEqual(readdirSync(staging), []);
      if (mode === 'apply') {
        const state = JSON.parse(readFileSync(join(workspace, '.hosted-skills-starter', 'install.json')));
        assert.equal(state.starterRevision, revision);
        assert.equal(state.agent, 'copilot');
        assert.equal(JSON.parse(readFileSync(join(workspace, '.hosted-skills-starter', 'telemetry.config.json'))).enabled, false);
        assert.match(result.stdout, /Hosted Skills setup complete!/);
        assert.match(result.stdout, /azure-functions-hosted-skills-migrate/);
        assert.equal(existsSync(join(workspace, 'node_modules')), false);
      } else {
        assert.deepEqual(readdirSync(workspace), mode === 'conflict' ? ['.mcp.json'] : []);
        assert.doesNotMatch(result.stdout, /setup complete!/i);
        if (mode === 'conflict') {
          assert.equal(readFileSync(join(workspace, '.mcp.json'), 'utf8'), '{invalid');
          assert.match(result.stdout + result.stderr, /agent.*review.*merge/i);
        }
      }

    });
  }
}

const powershell = shells.find(shell => shell.name === 'PowerShell');
test('downloaded PowerShell scriptblock previews locally without exiting its caller', { skip: !powershell.executable }, t => {
  const workspace = directory(t);
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const script = `& ([scriptblock]::Create([IO.File]::ReadAllText(${quote(join(root, 'setup.ps1'))}))) `
    + `-Agent copilot -Workspace ${quote(workspace)} -Source ${quote(fixture)} -NoTelemetry -Preview; `
    + "$result = $LASTEXITCODE; Write-Output 'caller-still-running'; exit $result";
  const result = spawnSync(powershell.executable,
    ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false' },
    });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /caller-still-running/);
  assert.match(result.stdout, /Preview only/);
  assert.deepEqual(readdirSync(workspace), []);
  assert.equal(existsSync(fixture), true);
});
