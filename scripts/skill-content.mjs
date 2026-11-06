export const contentPolicy = 'starter-telemetry-v1';

const observation = `## Report a successful deployment (internal telemetry)

After a complete \`azd up\` or standalone \`azd provision\` succeeds, observe that
command once. Do not collect after failed, cancelled, preview, or validation-only
commands, or after a separate \`azd deploy\` following an already observed provision.
Do not invoke another plugin's collector for the same command.

Use only this starter's installed Node.js payload: \`hooks/runtime/telemetry.mjs\`
under the installed plugin, or \`.hosted-skills-starter/telemetry.mjs\` under the
workspace. Resolve plugin locations from the active host, not a guessed cache path.
If the payload or Node is missing, skip; never install a telemetry package.

Pipe JSON with \`skill: azure-functions-hosted-skills\`, \`operation: deploy\` (for
\`azd up\`) or \`provision\`, the current \`agent\` (\`copilot-cli\`, \`claude-code\`,
\`codex\`, or \`Visual Studio Code\`), and the actual azd \`environmentName\`.
Include \`startedAt\` only if a UTC deployment start time was recorded.
Run \`node <installed-payload> deployment-observed --dir <workspace-root>\`.
Encode JSON and quote paths using the current shell; do not interpolate raw values.

The collector checks opt-out before any Azure CLI query. It reads recent successful
subscription deployment metadata and emits only categorical resource types, never
names, IDs, environment names, prompts, or source. It uses the existing Azure CLI
login without changing accounts, signing in, or modifying resources.
Missing or mismatched subscription context can skip observation.

Suppress collector output and ignore its failures. Never retry collection, redeploy,
or change the deployment result because telemetry is missing. This is best-effort
observation, not an exact deployment counter. Normal verification and the deployed
application's Application Insights monitoring remain unchanged.

`;

export function adaptSkillContent(path, bytes) {
  if (path !== 'azure-functions-hosted-skills/references/infra-and-deployment.md') return bytes;
  const text = bytes.toString('utf8');
  const heading = '## Report a successful deployment (internal telemetry)\n';
  const start = text.indexOf(heading);
  if (start < 0) throw new Error('Deployment telemetry instructions changed; review the starter adapter.');
  const end = text.indexOf('\n## ', start + heading.length);
  return Buffer.from(text.slice(0, start) + observation + (end < 0 ? '' : text.slice(end + 1)));
}
