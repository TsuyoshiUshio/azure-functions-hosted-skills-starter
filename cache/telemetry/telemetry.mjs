import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const distribution = 'hosted-skills-starter';
const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const clients = new Set(['copilot-cli', 'claude-code', 'codex', 'Visual Studio Code', 'unknown']);
const eventNames = new Set([
  'AzureFunctionsSkillsPluginExecuted', 'azure_deployment_observed', 'HostedSkillsStarterSetup',
]);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function configuration() {
  return JSON.parse(readFileSync(join(runtimeDirectory, 'telemetry-config.json'), 'utf8'));
}

export function telemetryEnabled(workspace, { environment = process.env, configPaths } = {}) {
  if (['HOSTED_SKILLS_STARTER_COLLECT_TELEMETRY', 'AZURE_FUNCTIONS_SKILLS_COLLECT_TELEMETRY',
    'AZURE_MCP_COLLECT_TELEMETRY'].some(key => environment[key]?.trim().toLowerCase() === 'false')) return false;
  const paths = [...(configPaths ?? [
    join(runtimeDirectory, 'telemetry.config.json'),
    join(runtimeDirectory, '..', 'telemetry.config.json'),
  ])];
  for (let directory = resolve(workspace); ; directory = dirname(directory)) {
    paths.push(join(directory, '.hosted-skills-starter', 'telemetry.config.json'));
    for (const host of ['.github', '.claude', '.codex']) {
      paths.push(join(directory, host, 'hooks', 'telemetry.config.json'));
    }
    if (dirname(directory) === directory) break;
  }
  let configured = false;
  for (const path of new Set(paths)) {
    try {
      const state = JSON.parse(readFileSync(path, 'utf8'));
      if (!record(state) || typeof state.enabled !== 'boolean' || !state.enabled) return false;
      configured = true;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      // An unreadable opt-out must not accidentally enable collection.
      return false;
    }
  }
  return configured;
}

export function usageProperties(value, client, config) {
  if (!record(value) || !clients.has(client)) return undefined;
  const tool = value.toolName ?? value.tool_name;
  let input = value.toolArgs ?? value.tool_input;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { return undefined; }
  }
  if (!record(input)) input = {};
  const base = { clientName: client, pluginName: 'azure-functions-skills' };
  const skills = new Set(config.skillFiles.map(path => path.split('/')[0]));
  if (tool === 'Skill' || tool === 'skill') {
    const skillName = typeof input.skill === 'string' ? input.skill.split(':').at(-1) : undefined;
    return skills.has(skillName) ? { ...base, eventType: 'skill_invocation', skillName } : undefined;
  }
  if (typeof tool !== 'string') return undefined;
  if (/^(?:functions_[a-z0-9_]+|azure-functions[a-z0-9_-]*|mcp__plugin_azure_azure__functions_[a-z0-9_]+|mcp_azure_mcp_functions_[a-z0-9_]+)$/.test(tool)
    && tool.length <= 256) return { ...base, eventType: 'tool_invocation', toolName: 'azure-functions' };
  if (!['view', 'Read', 'read_file', 'functions.view'].includes(tool)) return undefined;
  const path = input.path ?? input.filePath ?? input.file_path;
  if (typeof path !== 'string') return undefined;
  const normalized = path.replaceAll('\\', '/').replace(/\/+/g, '/');
  const relative = config.skillFiles.find(file =>
    normalized === `skills/${file}` || normalized.endsWith(`/skills/${file}`));
  if (!relative) return undefined;
  return relative.endsWith('/SKILL.md') && relative.split('/').length === 2
    ? { ...base, eventType: 'skill_invocation', skillName: relative.split('/')[0] }
    : { ...base, eventType: 'reference_file_read', fileReference: relative };
}

export function envelope(name, properties, config, now = new Date()) {
  if (!eventNames.has(name)) throw new Error('Unsupported telemetry event.');
  if (!/^[a-f0-9-]{36}$/.test(config.instrumentationKey)
    || !/^https:\/\/[a-z0-9-]+\.in\.applicationinsights\.azure\.com$/.test(config.endpoint)) {
    throw new Error('Unreviewed telemetry destination.');
  }
  return {
    name: 'Microsoft.ApplicationInsights.Event',
    time: now.toISOString(),
    iKey: config.instrumentationKey,
    data: { baseType: 'EventData', baseData: {
      ver: 2, name, properties: { ...properties, distribution },
    } },
  };
}

export function postEnvelope(value, endpoint, { request = httpsRequest, timeoutMs = 1500 } = {}) {
  return new Promise(resolveResult => {
    let req;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const timer = setTimeout(() => {
      req?.destroy();
      finish('failed');
    }, timeoutMs);
    try {
      const bytes = Buffer.from(JSON.stringify(value));
      req = request(new URL('/v2/track', endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': bytes.length },
      }, response => {
        response.on('error', () => finish('failed'));
        response.resume();
        response.on('end', () => finish(response.statusCode === 200 ? 'sent' : 'failed'));
      });
      req.on('error', () => finish('failed'));
      req.end(bytes);
    } catch {
      finish('failed');
    }
  });
}

async function emit(name, properties, config, transport = postEnvelope) {
  try { return await transport(envelope(name, properties, config), config.endpoint); }
  catch { return 'failed'; }
}

export async function sendUsage(value, {
  client = 'unknown', workspace = process.cwd(), environment = process.env,
  config, configPaths, transport,
} = {}) {
  try {
    if (!telemetryEnabled(workspace, { environment, configPaths })) return 'disabled';
    const settings = config ?? configuration();
    const properties = usageProperties(value, client, settings);
    if (!properties) return 'skipped';
    return await emit('AzureFunctionsSkillsPluginExecuted', properties, settings, transport);
  } catch {
    return 'failed';
  }
}

export async function sendSetup(client, workspace) {
  try {
    if (!clients.has(client) || !telemetryEnabled(workspace)) return 'disabled';
    const config = configuration();
    return await emit('HostedSkillsStarterSetup', {
      clientName: client, skillsVersion: config.skillsVersion,
    }, config);
  } catch {
    return 'failed';
  }
}

export async function observeDeployment(input, {
  workspace = process.cwd(), environment = process.env, config, configPaths, transport,
  arm, query, now = Date.now,
} = {}) {
  try {
    if (!telemetryEnabled(workspace, { environment, configPaths })) return 'disabled';
    if (!record(input) || Object.keys(input).some(key =>
      !['skill', 'operation', 'agent', 'environmentName', 'startedAt', 'skillsVersion'].includes(key))
      || input.skill !== 'azure-functions-hosted-skills'
      || !['deploy', 'provision'].includes(input.operation)
      || typeof input.environmentName !== 'string') return 'skipped';
    const settings = config ?? configuration();
    const collector = arm ?? await import('./arm-deployments.mjs');
    if (!collector.isValidDeploymentName(input.environmentName)) return 'skipped';
    const start = now();
    const deadlineMs = 6000;
    const budget = collector.createArmRequestBudget(8);
    budget.tryConsume();
    const requests = query ?? collector.createAzureCliDeploymentQuery(undefined, deadlineMs);
    const deployment = await requests.getDeploymentByName(input.environmentName);
    if (!deployment || deployment.provisioningState !== 'Succeeded') return 'skipped';
    const timestamp = Date.parse(deployment.timestamp);
    const age = now() - timestamp;
    if (!Number.isFinite(age) || age < -300000 || age > 1800000) return 'skipped';
    if (input.startedAt !== undefined) {
      const started = Date.parse(input.startedAt);
      if (!Number.isFinite(started) || timestamp < started) return 'skipped';
    }
    const remaining = deadlineMs - (now() - start);
    if (remaining <= 0) return 'skipped';
    const types = await collector.collectResourceTypes(deployment.id, requests, {
      deadlineMs: remaining, budget, maxRequests: 8,
    });
    if (types.status !== 'ok') return 'skipped';
    return await emit('azure_deployment_observed', {
      skill: input.skill, operation: input.operation, result: 'success',
      resourceTypes: types.resourceTypes.join(','),
      deploymentKind: 'hosted-agent',
      agent: clients.has(input.agent) ? input.agent : 'unknown',
      skillsVersion: settings.skillsVersion,
    }, settings, transport);
  } catch {
    return 'failed';
  }
}

async function readInput(limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('Telemetry input too large.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function runHook(client) {
  const deadline = setTimeout(() => process.exit(0), 2500);
  try {
    if (client === 'claude-code' && process.env.COPILOT_CLI === '1') return;
    if (!telemetryEnabled(process.cwd())) return;
    const input = await readInput(1024 * 1024);
    const workspace = [input?.cwd, process.env.CLAUDE_PROJECT_DIR, process.env.COPILOT_PROJECT_DIR]
      .find(path => typeof path === 'string' && isAbsolute(path)) ?? process.cwd();
    await sendUsage(input, { client, workspace });
  } catch {
    // Telemetry never changes a tool result or emits user content to the terminal.
  } finally {
    clearTimeout(deadline);
  }
}

async function main() {
  if (process.argv[2] === 'hook') {
    return runHook(process.argv[3] ?? 'unknown');
  }
  const deadline = setTimeout(() => process.exit(0), process.argv[2] === 'setup' ? 2500 : 8500);
  try {
    const dirIndex = process.argv.indexOf('--dir');
    const workspace = dirIndex < 0 ? process.cwd() : resolve(process.argv[dirIndex + 1]);
    if (!telemetryEnabled(workspace)) return;
    if (process.argv[2] === 'setup') return await sendSetup(process.argv[3] ?? 'unknown', workspace);
    if (process.argv[2] !== 'deployment-observed') return;
    await observeDeployment(await readInput(16 * 1024), { workspace });
  } catch {
    // Missing tools, malformed input, denied access, and delivery errors are non-fatal.
  } finally {
    clearTimeout(deadline);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0), () => process.exit(0));
}
