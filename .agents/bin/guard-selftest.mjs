// Proves the guard blocks what the policy says it blocks.
//
// Run:  node .agents/bin/guard-selftest.mjs
//
// It feeds the real guard and the real policy the same JSON Claude Code would
// send, inside a throwaway project directory, and compares exit codes. A
// guardrail nobody has watched refuse something is still an assumption.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const guard = join(repo, '.claude', 'hooks', 'guard.mjs');
const project = mkdtempSync(join(tmpdir(), 'agent-guard-'));
const runDir = join(project, '.agents', 'runs', 'F-012');

mkdirSync(runDir, { recursive: true });
cpSync(join(repo, '.agents', 'policy.json'), join(project, '.agents', 'policy.json'));
writeFileSync(join(project, '.agents', 'runs', '.active'), 'F-012\n');

function run(agent, tool, toolInput) {
  const payload = { tool_name: tool, tool_input: toolInput, cwd: project };
  if (agent !== null) payload.agent_type = agent;
  const result = spawnSync(process.execPath, [guard], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: 'utf8',
  });
  return result.status === 2 ? 'deny' : result.status === 0 ? 'allow' : `exit ${result.status}`;
}

const file = (path) => ({ file_path: join(project, path) });
const bash = (command) => ({ command });
const nav = 'mcp__playwright__browser_navigate';

/** [expected, agent, tool, input] */
const cases = [
  // Anything that is not one of our agents is never restricted.
  ['allow', null, 'Write', file('supabase/migrations/0061_x.sql')],
  ['allow', 'Explore', 'Bash', bash('git push')],
  ['allow', null, 'Read', file('.env')],

  // QA walks the local app and writes reports. It never touches the code.
  ['allow', 'qa', 'Write', file('.agents/runs/F-012/report.md')],
  ['allow', 'qa', 'Write', file('.agents/runs/F-012/retest.md')],
  ['allow', 'qa', 'Write', file('.agents/findings/F-013-chat-vacio.md')],
  ['allow', 'qa', 'Write', file('.agents/qa/accounts.md')],
  ['allow', 'qa', 'Edit', file('.agents/qa/coverage.md')],
  ['deny', 'qa', 'Write', file('.agents/runs/F-011/report.md')],
  ['deny', 'qa', 'Write', file('.agents/findings/notes.md')],
  ['deny', 'qa', 'Edit', file('src/features/chat/ChatScreen.tsx')],
  ['deny', 'qa', 'Write', file('.agents/runs/F-012/review.md')],
  ['deny', 'qa', 'Bash', bash('ls')],
  ['allow', 'qa', 'Read', file('src/features/chat/ChatScreen.tsx')],
  ['allow', 'qa', 'Read', file('.env.example')],
  ['deny', 'qa', 'Read', file('.env')],
  ['deny', 'qa', 'Read', file('.env.local')],
  ['allow', 'qa', nav, { url: 'http://localhost:8081/registro' }],
  ['allow', 'qa', nav, { url: 'http://127.0.0.1:54324/' }],
  ['allow', 'qa', 'mcp__playwright__browser_click', { element: 'Unirme', ref: 'e12' }],
  ['allow', 'qa', 'mcp__playwright__browser_tabs', { action: 'new', url: 'http://localhost:8081' }],
  ['deny', 'qa', nav, { url: 'https://movo.example.com/registro' }],
  ['deny', 'qa', nav, { url: 'https://abcd.supabase.co/auth/v1/signup' }],
  ['deny', 'qa', nav, { url: 'http://localhost:54323/' }],
  ['deny', 'qa', nav, { url: 'file:///C:/Users' }],
  ['deny', 'qa', 'mcp__playwright__browser_tabs', { action: 'new', url: 'https://example.com' }],
  ['deny', 'qa', 'mcp__playwright__browser_run_code_unsafe', { code: '1' }],
  ['deny', 'qa', 'mcp__playwright__browser_file_upload', { paths: ['C:/x'] }],
  ['deny', 'qa', 'mcp__github__create_issue', { title: 'x' }],

  // The developer changes the source tree and nothing else.
  ['allow', 'developer', 'Write', file('src/features/chat/ChatScreen.tsx')],
  ['allow', 'developer', 'Edit', file('src/lib/money.test.ts')],
  ['allow', 'developer', 'Write', file('.agents/runs/F-012/dev-notes.md')],
  ['deny', 'developer', 'Write', file('supabase/migrations/0061_x.sql')],
  ['deny', 'developer', 'Edit', file('supabase/migrations/0001_init.sql')],
  ['deny', 'developer', 'Edit', file('package.json')],
  ['deny', 'developer', 'Write', file('.env.local')],
  ['deny', 'developer', 'Write', file('.agents/findings/F-012-x.md')],
  ['deny', 'developer', 'Write', file('.agents/runs/F-012/retest.md')],
  ['deny', 'developer', 'Write', { file_path: join(project, '..', 'escape.ts') }],
  ['deny', 'developer', 'Read', file('.env')],
  ['allow', 'developer', 'Bash', bash('npm run test -- src/lib/money.test.ts 2>&1')],
  ['allow', 'developer', 'Bash', bash('npm run verify')],
  ['allow', 'developer', 'Bash', bash('git diff --stat && git status')],
  ['deny', 'developer', 'Bash', bash('git commit -am wip')],
  ['deny', 'developer', 'Bash', bash('git status && git push origin HEAD')],
  ['deny', 'developer', 'Bash', bash('npm install left-pad')],
  ['deny', 'developer', 'Bash', bash('npx supabase db push')],
  ['deny', 'developer', 'Bash', bash('npm run db:reset')],
  ['deny', 'developer', 'Bash', bash('cat .env')],
  ['deny', 'developer', 'Bash', bash('gh pr create --fill')],
  ['deny', 'developer', 'Bash', bash('echo {} > .agents/runs/F-012/retest.md')],
  ['deny', 'developer', nav, { url: 'http://localhost:8081' }],

  ['allow', 'reviewer', 'Write', file('.agents/runs/F-012/review.md')],
  ['deny', 'reviewer', 'Edit', file('src/features/chat/ChatScreen.tsx')],
  ['deny', 'reviewer', 'Bash', bash('npm run test')],
  ['deny', 'reviewer', 'Read', file('.env')],
];

let failed = 0;
for (const [expected, agent, tool, toolInput] of cases) {
  const actual = run(agent, tool, toolInput);
  const target =
    toolInput.command ??
    toolInput.url ??
    toolInput.file_path?.slice(project.length + 1) ??
    tool.split('__').pop();
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${expected.padEnd(5)} ${agent ?? 'main'} ${tool} ${target}`);
  if (!ok) console.log(`       got ${actual}`);
}

// With no active run, a named agent has nowhere it is allowed to write.
rmSync(join(project, '.agents', 'runs', '.active'));
const orphan = run('developer', 'Write', file('src/lib/money.ts'));
if (orphan !== 'deny') failed += 1;
console.log(`${orphan === 'deny' ? 'ok  ' : 'FAIL'} deny  developer Write with no active run`);

rmSync(project, { recursive: true, force: true });
console.log(failed === 0 ? `\nguard: ${cases.length + 1} cases pass` : `\nguard: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
