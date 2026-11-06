import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  distribution, envelope, observeDeployment, postEnvelope, sendUsage, telemetryEnabled, usageProperties,
} from '../scripts/telemetry.mjs';
import * as arm from '../plugin/hooks/runtime/arm-deployments.mjs';

const root = resolve(import.meta.dirname, '..');
const config = {
  instrumentationKey: '00000000-0000-0000-0000-000000000000',
  endpoint: 'https://westus2-2.in.applicationinsights.azure.com',
  skillsVersion: 'fixture',
  skillFiles: ['azure-functions-hosted-skills/SKILL.md', 'azure-functions-hosted-skills/references/testing.md'],
};

function options(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'starter-telemetry-test-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const path = join(workspace, 'telemetry.config.json');
  writeFileSync(path, '{"enabled":true}');
  return { workspace, config, environment: {}, configPaths: [path] };
}

test('usage parser allowlists skills, file references and Functions tools, not raw context', () => {
  for (const client of ['claude-code', 'codex', 'copilot-cli', 'Visual Studio Code']) {
    const properties = usageProperties({
      tool_name: 'Skill', tool_input: { skill: 'plugin:azure-functions-hosted-skills', secret: 'private' },
      session_id: 'private-session', cwd: 'private-directory',
    }, client, config);
    assert.deepEqual(properties, {
      clientName: client, pluginName: 'azure-functions-skills',
      eventType: 'skill_invocation', skillName: 'azure-functions-hosted-skills',
    });
  }
  const file = usageProperties({ toolName: 'view', toolArgs: JSON.stringify({
    path: 'C:\\private\\project\\.agents\\skills\\azure-functions-hosted-skills\\references\\testing.md',
  }) }, 'codex', config);
  assert.equal(file.fileReference, 'azure-functions-hosted-skills/references/testing.md');
  assert.equal(JSON.stringify(file).includes('private'), false);
  assert.equal(usageProperties({ toolName: 'functions_create', toolArgs: { secret: 'private' } },
    'copilot-cli', config).toolName, 'azure-functions');
  assert.equal(usageProperties({ toolName: 'functions_private_identifier' },
    'copilot-cli', config).toolName, 'azure-functions');
  for (const input of [
    null, {}, { toolName: 'view', toolArgs: '{invalid' },
    { toolName: 'Skill', toolArgs: { skill: 'unrelated' } },
    { toolName: 'view', toolArgs: { path: 'C:\\customer\\secrets.txt' } },
    { toolName: 'functions_create?secret=private' },
  ]) assert.equal(usageProperties(input, 'codex', config), undefined);
});

test('App Insights EventData envelope forces starter attribution and a reviewed destination', () => {
  const value = envelope('AzureFunctionsSkillsPluginExecuted', {
    eventType: 'skill_invocation', distribution: 'spoofed',
  }, config, new Date('2030-01-01T00:00:00Z'));
  assert.equal(value.data.baseType, 'EventData');
  assert.equal(value.iKey, config.instrumentationKey);
  assert.equal(value.data.baseData.properties.distribution, distribution);
  assert.equal(value.time, '2030-01-01T00:00:00.000Z');
  assert.throws(() => envelope('unknown', {}, config), /Unsupported/);
  assert.throws(() => envelope('azure_deployment_observed', {}, { ...config, endpoint: 'http://example.test' }), /destination/);
});

test('environment, ancestor, malformed and unreadable opt-outs fail closed before network or Azure queries', async t => {
  const opts = options(t);
  const never = () => { throw new Error('must not call'); };
  for (const key of ['HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY',
    'AZURE_FUNCTIONS_SKILLS_COLLECT_TELEMETRY', 'AZURE_MCP_COLLECT_TELEMETRY']) {
    const disabled = { ...opts, environment: { [key]: ' FALSE ' }, transport: never, query: never };
    assert.equal(await sendUsage({ toolName: 'Skill' }, disabled), 'disabled');
    assert.equal(await observeDeployment({}, disabled), 'disabled');
  }
  const child = join(opts.workspace, 'app', 'nested');
  mkdirSync(child, { recursive: true });
  const inherited = join(opts.workspace, '.hosted-skills-starter');
  mkdirSync(inherited);
  const path = join(inherited, 'telemetry.config.json');
  writeFileSync(path, '{"enabled":false}');
  assert.equal(telemetryEnabled(child, opts), false);
  writeFileSync(path, '{invalid');
  assert.equal(telemetryEnabled(child, opts), false);
  rmSync(path);
  mkdirSync(path);
  assert.equal(telemetryEnabled(child, opts), false);
  rmdirSync(path);
  assert.equal(telemetryEnabled(child, opts), true);
  assert.equal(opts.configPaths.length, 1);
});

test('usage sends only normalized properties and ignores failed delivery', async t => {
  const opts = options(t);
  let value;
  assert.equal(await sendUsage({
    toolName: 'Skill', toolArgs: { skill: 'azure-functions-hosted-skills', prompt: 'private' },
  }, { ...opts, client: 'codex', transport: async event => { value = event; return 'sent'; } }), 'sent');
  assert.equal(value.data.baseData.properties.clientName, 'codex');
  assert.equal(JSON.stringify(value).includes('private'), false);
  assert.equal(await sendUsage({ toolName: 'Skill', toolArgs: { skill: 'azure-functions-hosted-skills' } },
    { ...opts, transport: async () => { throw new Error('offline'); } }), 'failed');
  assert.equal(await sendUsage({ toolName: 'unrelated' }, { ...opts, transport: () => assert.fail() }), 'skipped');
});

test('HTTPS transport serializes a real envelope and bounds errors, responses and timeouts without retry', async () => {
  const value = envelope('HostedSkillsStarterSetup', { clientName: 'codex' }, config);
  let calls = 0;
  let bytes;
  const request = (url, options, callback) => {
    calls++;
    assert.equal(url.href, `${config.endpoint}/v2/track`);
    assert.equal(options.method, 'POST');
    const req = new EventEmitter();
    req.end = data => {
      bytes = JSON.parse(data);
      const response = new EventEmitter();
      response.statusCode = 200;
      response.resume = () => {};
      callback(response);
      queueMicrotask(() => response.emit('end'));
    };
    return req;
  };
  assert.equal(await postEnvelope(value, config.endpoint, { request }), 'sent');
  assert.deepEqual(bytes, value);
  assert.equal(calls, 1);
  assert.equal(await postEnvelope(value, config.endpoint, {
    request: () => { throw new Error('DNS unavailable'); },
  }), 'failed');
  let destroyed = false;
  assert.equal(await postEnvelope(value, config.endpoint, { timeoutMs: 20, request: () => {
    const req = new EventEmitter();
    req.end = () => {};
    req.destroy = () => { destroyed = true; };
    return req;
  } }), 'failed');
  assert.equal(destroyed, true);
});

test('deployment observation uses bounded read-only ARM traversal and transmits no identifiers', async t => {
  const opts = options(t);
  const instant = Date.parse('2030-01-01T00:00:00Z');
  const calls = [];
  const id = '/subscriptions/private-sub/providers/Microsoft.Resources/deployments/private-environment';
  const query = arm.createAzureCliDeploymentQuery(async args => {
    calls.push(args);
    if (args[0] === 'deployment') return JSON.stringify({
      id, name: 'private-environment',
      properties: { provisioningState: 'Succeeded', timestamp: new Date(instant).toISOString() },
    });
    return JSON.stringify({ value: [{
      properties: {
        provisioningOperation: 'Create', provisioningState: 'Succeeded',
        targetResource: { id: 'private-resource', resourceType: 'Microsoft.Web/sites' },
      },
    }] });
  });
  let value;
  const input = {
    skill: 'azure-functions-hosted-skills', operation: 'deploy', agent: 'codex',
    environmentName: 'private-environment', startedAt: new Date(instant - 1000).toISOString(),
    skillsVersion: 'untrusted-version',
  };
  assert.equal(await observeDeployment(input, {
    ...opts, arm, query, now: () => instant + 1000,
    transport: async event => { value = event; return 'sent'; },
  }), 'sent');
  assert.deepEqual(calls[0], ['deployment', 'sub', 'show', '--name', 'private-environment', '-o', 'json']);
  assert.deepEqual(calls[1].slice(0, 3), ['rest', '--method', 'get']);
  assert.deepEqual(value.data.baseData.properties, {
    skill: input.skill, operation: 'deploy', result: 'success',
    resourceTypes: 'microsoft.web/sites', deploymentKind: 'hosted-agent', agent: 'codex',
    skillsVersion: 'fixture', distribution,
  });
  assert.equal(JSON.stringify(value).includes('private'), false);
});

test('failed, old, future, mismatched and over-budget deployments are not counted', async t => {
  const opts = options(t);
  const instant = Date.parse('2030-01-01T00:00:00Z');
  const input = { skill: 'azure-functions-hosted-skills', operation: 'provision', environmentName: 'fixture' };
  const summary = { id: '/subscriptions/x/providers/Microsoft.Resources/deployments/x',
    provisioningState: 'Succeeded', timestamp: new Date(instant).toISOString() };
  for (const changed of [
    undefined, { ...summary, provisioningState: 'Failed' },
    { ...summary, timestamp: new Date(instant - 1800001).toISOString() },
    { ...summary, timestamp: new Date(instant + 300001).toISOString() },
  ]) assert.equal(await observeDeployment(input, {
    ...opts, arm, now: () => instant,
    query: { getDeploymentByName: async () => changed, listDeploymentOperations: () => assert.fail() },
    transport: () => assert.fail(),
  }), 'skipped');
  assert.equal(await observeDeployment({ ...input, startedAt: new Date(instant + 1).toISOString() }, {
    ...opts, arm, now: () => instant, query: { getDeploymentByName: async () => summary },
    transport: () => assert.fail(),
  }), 'skipped');
  assert.equal(await observeDeployment({ ...input, environmentName: 'x&az login' }, {
    ...opts, arm, query: { getDeploymentByName: () => assert.fail() },
  }), 'skipped');
  const budget = arm.createArmRequestBudget(0);
  assert.equal((await arm.collectResourceTypes(summary.id, {
    listDeploymentOperations: () => assert.fail(),
  }, { budget })).status, 'skip');
  const windows = arm.buildRunnerInvocation('win32', ['deployment', 'sub', 'show', '--name', 'safe-name']);
  assert.deepEqual(windows.args.slice(0, 3), ['/d', '/s', '/c']);
});

test('actual opt-out CLI ignores malformed input and oversized payloads with exit zero and no output', () => {
  const script = join(root, 'plugin', 'hooks', 'runtime', 'telemetry.mjs');
  for (const [command, input] of [['hook', '{invalid'], ['deployment-observed', 'x'.repeat(20000)]]) {
    const result = spawnSync(process.execPath, [script, command], {
      input, encoding: 'utf8', env: { ...process.env, HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false' },
      timeout: 5000,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
  assert.equal(execFileSync(process.execPath, [script, 'unknown'], {
    env: { ...process.env, HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY: 'false' }, encoding: 'utf8',
  }), '');
});

test('real enabled hook honors payload workspace opt-out even when launched from the plugin directory', t => {
  const opts = options(t);
  const privateDirectory = join(opts.workspace, '.hosted-skills-starter');
  mkdirSync(privateDirectory);
  const choice = join(privateDirectory, 'telemetry.config.json');
  writeFileSync(choice, '{"enabled":false}');
  const marker = join(opts.workspace, 'attempted-event.json');
  const script = join(root, 'plugin', 'hooks', 'runtime', 'telemetry.mjs');
  const preload = pathToFileURL(join(root, 'tests', 'fixtures', 'offline-telemetry.mjs')).href;
  const env = { ...process.env, STARTER_TEST_LOG: marker };
  for (const key of ['HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY',
    'AZURE_FUNCTIONS_SKILLS_COLLECT_TELEMETRY', 'AZURE_MCP_COLLECT_TELEMETRY']) delete env[key];
  const run = input => spawnSync(process.execPath, ['--import', preload, script, 'hook', 'codex'], {
    cwd: join(root, 'plugin'), input, encoding: 'utf8', env, timeout: 5000,
  });
  const input = JSON.stringify({ cwd: opts.workspace,
    toolName: 'Skill', toolArgs: { skill: 'azure-functions-hosted-skills', prompt: 'private' } });
  const disabled = run(input);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(existsSync(marker), false);
  writeFileSync(choice, '{"enabled":true}');
  const failedDelivery = run(input);
  assert.equal(failedDelivery.status, 0, failedDelivery.stderr);
  assert.equal(failedDelivery.stdout, '');
  assert.equal(failedDelivery.stderr, '');
  const value = JSON.parse(readFileSync(marker, 'utf8'));
  assert.equal(value.data.baseData.properties.clientName, 'codex');
  assert.equal(JSON.stringify(value).includes('private'), false);
  rmSync(marker);
  assert.equal(run('x'.repeat(1024 * 1024 + 1)).status, 0);
  assert.equal(existsSync(marker), false);
});

test('hook stdin deadline terminates an actual stalled child process', { timeout: 6000 }, async t => {
  const env = { ...process.env };
  for (const key of ['HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY',
    'AZURE_FUNCTIONS_SKILLS_COLLECT_TELEMETRY', 'AZURE_MCP_COLLECT_TELEMETRY']) delete env[key];
  const child = spawn(process.execPath, [
    join(root, 'plugin', 'hooks', 'runtime', 'telemetry.mjs'), 'hook', 'codex',
  ], { stdio: ['pipe', 'pipe', 'pipe'], env });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const started = Date.now();
  const result = await new Promise((resolveResult, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => resolveResult({ code, signal }));
  });
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  const duration = Date.now() - started;
  assert.ok(duration >= 2400 && duration < 5000, `Unexpected stdin deadline: ${duration}ms`);
});
