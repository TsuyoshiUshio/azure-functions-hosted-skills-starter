import { readFileSync } from 'node:fs';

export const skillRoots = ['plugin/skills'];
export const pluginName = 'hosted-skills-starter';
export const agents = ['claude', 'codex', 'copilot', 'vscode'];
export const clientNames = {
  claude: 'claude-code', codex: 'codex', copilot: 'copilot-cli', vscode: 'Visual Studio Code',
};
export const skillDirectories = {
  claude: '.claude/skills', codex: '.agents/skills',
  copilot: '.github/skills', vscode: '.github/skills',
};
const workspaceInstructions = () =>
  readFileSync(new URL('../assets/workspace-instructions.md', import.meta.url), 'utf8');

export function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function hookCommand(agent, { plugin = false, windows = false } = {}) {
  const client = clientNames[agent];
  if (!client) throw new Error(`Unsupported agent: ${agent}`);
  const locate = plugin
    ? `let d=process.env.${agent === 'claude' ? 'CLAUDE_PLUGIN_ROOT' : 'PLUGIN_ROOT'}||process.env.CLAUDE_PLUGIN_ROOT;let s=p.join(d,'hooks','runtime','telemetry.mjs');`
    : "let d=process.cwd();while(!f.existsSync(p.join(d,'.hosted-skills-starter','telemetry.mjs'))&&p.dirname(d)!==d)d=p.dirname(d);let s=p.join(d,'.hosted-skills-starter','telemetry.mjs');";
  const code = `let f=require('node:fs'),p=require('node:path');try{${locate}import(require('node:url').pathToFileURL(s).href).then(m=>m.runHook('${client}')).then(()=>process.exit(0)).catch(()=>process.exit(0));}catch{}`;
  const command = `node -e "${code}"`;
  return windows
    ? `try { ${command} 2>$null | Out-Null } catch { }; exit 0`
    : `${command} >/dev/null 2>&1 || true`;
}

export function hookGroup(agent, plugin = false) {
  return { hooks: [{
    type: 'command',
    command: hookCommand(agent, { plugin }),
    ...(agent === 'codex' ? { commandWindows: hookCommand(agent, { plugin, windows: true }) } : {}),
    timeout: 4,
    async: true,
  }] };
}

export function codexMcpBlock(server) {
  return [
    '# BEGIN hosted-skills-starter', '[mcp_servers.azure]', `command = ${JSON.stringify(server.command)}`,
    `args = ${JSON.stringify(server.args)}`, '[mcp_servers.azure.env]',
    ...Object.entries(server.env).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`),
    '# END hosted-skills-starter', '',
  ].join('\n');
}

export function workspaceHostFiles(agent, config, instruction = workspaceInstructions()) {
  if (!agents.includes(agent)) throw new Error(`Unsupported agent: ${agent}`);
  const server = config.mcp.azure;
  const mcpPath = agent === 'codex' ? '.codex/config.toml' : agent === 'vscode' ? '.vscode/mcp.json' : '.mcp.json';
  const hookPath = agent === 'claude' ? '.claude/settings.json'
    : agent === 'codex' ? '.codex/hooks.json' : '.github/hooks/hosted-skills-starter.json';
  const hooks = agent === 'claude' || agent === 'codex'
    ? { hooks: { PostToolUse: [hookGroup(agent)] } }
    : { version: 1, hooks: { postToolUse: [{
      type: 'command', bash: hookCommand(agent),
      powershell: hookCommand(agent, { windows: true }), timeoutSec: 4, cwd: '.',
    }] } };
  const files = new Map([
    [mcpPath, agent === 'codex' ? codexMcpBlock(server)
      : json(agent === 'vscode' ? { servers: { azure: { type: 'stdio', ...server } } }
        : { mcpServers: { azure: server } })],
    [hookPath, json(hooks)],
    [agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md',
      `# BEGIN hosted-skills-starter\n${instruction.replaceAll('{{skillRoot}}', skillDirectories[agent])}# END hosted-skills-starter\n`],
  ]);
  if (agent === 'copilot' || agent === 'vscode') {
    files.set('.github/instructions/hosted-skills-starter.instructions.md',
      '---\napplyTo: "**"\n---\n\nRead the Hosted Skills starter block in the workspace-root `AGENTS.md`.\n');
  }
  return files;
}

export function hostFiles(config, instruction = workspaceInstructions()) {
  const metadata = {
    name: pluginName, version: '0.1.0',
    description: 'Hosted Skills starter subset: authoring, migration, Connector lifecycle, MCP, and opt-out telemetry.',
    author: { name: 'Azure Functions Team' },
    repository: 'https://github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter',
    license: 'MIT',
    skills: './skills/',
    mcpServers: './.mcp.json',
  };
  const copilot = {
    ...metadata,
    hooks: { paths: ['./hooks/copilot-hooks.json'], exclusive: true },
  };
  const copilotHook = {
    type: 'command',
    cwd: '.',
    bash: hookCommand('copilot', { plugin: true }),
    powershell: hookCommand('copilot', { plugin: true, windows: true }),
    timeoutSec: 4,
  };
  const files = new Map([
    ['plugin/.claude-plugin/plugin.json', json(metadata)],
    ['plugin/.codex-plugin/plugin.json', json({ ...metadata, hooks: './hooks/codex-hooks.json' })],
    ['plugin/plugin.json', json(copilot)],
    ['plugin/.mcp.json', json({ mcpServers: { azure: config.mcp.azure } })],
    ['plugin/AGENTS.md', instruction.replaceAll('{{skillRoot}}', 'skills')],
    ['plugin/CLAUDE.md', '@AGENTS.md\n'],
    ['plugin/hooks/hooks.json', json({ hooks: { PostToolUse: [hookGroup('claude', true)] } })],
    ['plugin/hooks/codex-hooks.json', json({ hooks: { PostToolUse: [hookGroup('codex', true)] } })],
    ['plugin/hooks/copilot-hooks.json', json({ hooks: { PostToolUse: [copilotHook] } })],
    ['plugin/hooks/telemetry.config.json', json({ enabled: true })],
    ['.claude-plugin/marketplace.json', json({
      name: pluginName, owner: { name: 'Azure Functions Team' },
      metadata: { description: metadata.description, version: metadata.version },
      plugins: [{ name: pluginName, source: './plugin', version: metadata.version, description: metadata.description }],
    })],
    ['.agents/plugins/marketplace.json', json({
      name: pluginName, interface: { displayName: 'Azure Functions Hosted Skills Starter' },
      plugins: [{
        name: pluginName, source: { source: 'local', path: './plugin' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Coding',
      }],
    })],
  ]);
  for (const agent of agents) {
    for (const [path, content] of workspaceHostFiles(agent, config, instruction)) {
      files.set(`assets/setup/${agent}/${path}`, content);
    }
  }
  return files;
}
