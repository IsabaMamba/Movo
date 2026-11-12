// PreToolUse guard for the agent pipeline (.agents/README.md).
//
// Claude Code passes the tool call as JSON on stdin. When the call comes from a
// subagent, `agent_type` holds that agent's name; from the main session it is
// absent. This script looks the name up in .agents/policy.json and exits 2 to
// block anything the role may not do. A prompt can ask an agent to stay in its
// lane; this is the part that does not depend on the agent agreeing.
//
// Failure modes are chosen, not accidental:
//   - main session, or a subagent the policy does not name  -> always allowed
//   - a named agent and anything goes wrong in here         -> denied
// The shell rules are best effort: a shell can always write a file some way a
// pattern did not foresee. The control-plane check in run.mjs is what detects
// a change that got through.
import { appendFileSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

/** Set once a named agent's call is being judged; null means nothing to record. */
let audit = null;

// Every decision about a named agent lands in the run's guard.log, so a run can
// be audited afterwards: who tried what, and what was refused.
function record(decision, reason) {
  if (audit === null) return;
  try {
    const line = { time: new Date().toISOString(), ...audit, decision, reason };
    appendFileSync(
      join(root, '.agents', 'runs', audit.run, 'guard.log'),
      `${JSON.stringify(line)}\n`,
    );
  } catch {
    // The log is evidence, not a gate: failing to write it must not change the decision.
  }
}

function deny(reason) {
  record('deny', reason);
  console.error(`agent guard: ${reason}`);
  process.exit(2);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Project-relative path with forward slashes, or null when it leaves the project. */
function toRelative(path, cwd) {
  if (typeof path !== 'string' || path === '') return null;
  const absolute = isAbsolute(path) ? path : resolve(cwd ?? root, path);
  const rel = relative(root, absolute).replaceAll('\\', '/');
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel;
}

/** Minimal glob: `**` crosses directories, `*` stays inside one. */
function globToRegExp(glob) {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/|\*\*|\*/g, (token) =>
      token === '**/' ? '(?:.*/)?' : token === '**' ? '.*' : '[^/]*',
    );
  return new RegExp(`^${source}$`, process.platform === 'win32' ? 'i' : '');
}

function matchesAny(rel, globs) {
  return globs.some((glob) => globToRegExp(glob).test(rel));
}

function loadRun() {
  const run = readFileSync(join(root, '.agents', 'runs', '.active'), 'utf8').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(run)) throw new Error(`invalid active run id "${run}"`);
  return run;
}

const expand = (patterns, run) =>
  (patterns ?? []).map((pattern) => pattern.replaceAll('{run}', run));

function checkWrite(agent, rules, input, run) {
  const rel = toRelative(input.tool_input?.file_path ?? input.tool_input?.notebook_path, input.cwd);
  if (rel === null) deny(`${agent} may not write outside the project`);
  const allowed = expand(rules.write, run);
  if (!matchesAny(rel, allowed)) {
    deny(`${agent} may not write ${rel}. Allowed: ${allowed.join(', ') || 'nothing'}`);
  }
}

/** Environment files hold keys; no agent of the pipeline has a reason to open one. */
function checkRead(agent, policy, input) {
  const target = input.tool_input?.file_path ?? input.tool_input?.path;
  const rel = toRelative(target, input.cwd);
  if (rel === null) return;
  const name = rel.split('/').pop();
  if (matchesAny(name, policy.readDeny ?? []) && !matchesAny(name, policy.readAllow ?? [])) {
    deny(`${agent} may not read ${rel}: environment files are off limits`);
  }
}

function checkBash(agent, rules, input) {
  if (!rules.bash) deny(`${agent} has no shell access`);
  const command = String(input.tool_input?.command ?? '');

  for (const [, sub] of command.matchAll(/\bgit\s+([^\s;&|]+)/g)) {
    if (!rules.bash.gitAllow.includes(sub)) {
      deny(`${agent} may only read git (${rules.bash.gitAllow.join(', ')}); got "git ${sub}"`);
    }
  }
  for (const { pattern, reason } of rules.bash.deny ?? []) {
    if (new RegExp(pattern, 'i').test(command)) deny(`${agent}: ${reason}`);
  }
}

/**
 * The browser is for the app running on this machine. A URL anywhere else is
 * refused, so a test account never gets typed into a site that is not the
 * local build, and the live project is never the thing under test.
 */
function checkBrowser(agent, rules, tool, input) {
  if (!rules.browser) deny(`${agent} has no browser`);
  const prefix = `mcp__${rules.browser.server}__`;
  if (!tool.startsWith(prefix)) deny(`${agent} may only use the ${rules.browser.server} browser`);
  const name = tool.slice(prefix.length);
  if (rules.browser.denyTools.includes(name)) deny(`${agent} may not use ${name}`);

  const url = input.tool_input?.url;
  if (url === undefined || url === null || url === '') return;
  let origin;
  try {
    origin = new URL(String(url)).origin;
  } catch {
    deny(`${agent}: "${url}" is not a URL`);
  }
  if (!rules.browser.origins.includes(origin)) {
    deny(`${agent} may only open ${rules.browser.origins.join(', ')}; got ${origin}`);
  }
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const agent = input.agent_type;
if (typeof agent !== 'string') process.exit(0);

try {
  const policy = readJson(join(root, '.agents', 'policy.json'));
  const rules = policy.agents?.[agent];
  if (!rules) process.exit(0);

  // A named agent only ever works inside a run; with none active, nothing is allowed.
  const run = loadRun();
  const tool = String(input.tool_name);
  const { file_path, notebook_path, command, path, pattern, url } = input.tool_input ?? {};
  audit = {
    run,
    agent,
    tool,
    target: file_path ?? notebook_path ?? command ?? url ?? path ?? pattern ?? null,
  };

  if (tool === 'Bash') {
    checkBash(agent, rules, input);
  } else if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
    checkWrite(agent, rules, input, run);
  } else if (tool === 'Read' || tool === 'Grep') {
    checkRead(agent, policy, input);
  } else if (tool.startsWith('mcp__')) {
    checkBrowser(agent, rules, tool, input);
  }
  record('allow', null);
} catch (error) {
  deny(`refusing because the guard itself failed (${error.message})`);
}
