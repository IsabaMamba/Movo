# Agent pipeline

Three Claude Code subagents that do for Movo what nobody has had the time to do: walk every
screen signed in, write down what is wrong, fix it, and check the fix in the running app.

```
QA sweeps an area  →  findings  →  a person picks which to fix
                                        │
        ┌───────────────────────────────┘
        ▼
   Developer fixes one  →  gates  →  QA retests in the browser  →  Reviewer  →  a person decides on the PR
        ▲                    │                 │                       │
        └────────────────────┴─────────────────┴───────────────────────┘
                     back to the Developer, three cycles at most
```

The design separates two things:

- **Agents supply judgement**: what is wrong, why, how to fix it, whether the fix is right.
- **A script supplies facts**: [`bin/run.mjs`](bin/run.mjs) decides whether the app under test
  is the local one, which phase a run is in, how many cycles it has used, whether anybody
  touched a file they should not have, and whether the gates pass.

The orchestrator calls an agent, then the script, and acts on the `RESULT:` line the script
prints. What an agent says about its own work is a claim, not a fact.

## What it is for, and what it is not

It covers the gap `docs/status.md` names: the SQL suite covers the rules and Vitest covers the
arithmetic, and nobody has watched the screens use them.

It does not cover:

- **Anything outside `src/`.** The developer agent cannot write a migration, a policy, an RPC,
  a dependency or configuration. When a fix needs one, the run stops with a description of what
  is needed, for a person to do.
- **Anything that needs the hosted project**: push delivery, Apple and Google sign-in, real
  email, applying migrations.
- **The decisions in the roadmap that are not code**: counsel on Ley 8968, SMTP, VAPID keys.
- **Native builds.** QA tests the web build in a browser.

## One-time setup

QA signs up accounts and writes data, so it only ever runs against a **local** Supabase stack.
`preflight` refuses anything else.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and leave it open.
2. Start the local stack. The first run downloads the images and applies every migration:

   ```bash
   npx supabase start
   ```

3. Point the app at it. This writes `.env.local`, which Expo reads over `.env` and which is
   git-ignored. `.env` is not touched:

   ```bash
   node .agents/bin/run.mjs local-env
   ```

4. Start the web build with a clean cache, so it picks up `.env.local`:

   ```bash
   npx expo start --web --clear
   ```

5. Check:

   ```bash
   node .agents/bin/run.mjs preflight
   ```

To go back to the hosted project, delete `.env.local` and restart the dev server with `--clear`.
`npx supabase db reset` empties the local database; QA's accounts go with it and it recreates
them on the next run.

The local database starts empty. There are no zones, no venues and no staff account, so
Descubrir by zone and the `/staff` screens need data loaded by hand first
(`scripts/load-zones.mjs`, and a row in `staff` from the Supabase SQL editor at
`http://127.0.0.1:54323`).

## Using it

In Claude Code, from this repository:

```
/qa-sweep <area | auto>
/agent-fix <F-id>
```

or ask in words: "haz un sweep de registro", "arregla F-012".

**`/qa-sweep`** sends QA through one area: `registro`, `crear`, `series`, `grupos`, `chat`,
`perfil`, `organizar`, or `auto` to let it choose from what `docs/status.md` says has never been
seen and what `qa/coverage.md` says has. It comes back with at most fifteen
findings, each a file under `findings/`, and a report of what works and what it could not
reach. A person decides which to fix.

**`/agent-fix`** takes one finding through the loop on a branch named
`fix/f-<number>-<slug>`. It stops before pushing. Merging is never the pipeline's.

A finding is `open` until a fix for it is approved, then `fixed`, with the branch recorded in
it. `fixed` means approved and waiting for a person to merge, not merged.

## What the script guarantees

- **Local only.** `preflight` checks three things independently: `.env.local` points at
  `127.0.0.1`, the local stack answers, and the bundle the dev server is serving does not
  contain the hosted project's address. A dev server started before `.env.local` existed fails
  the third.
- **Order.** Each command names the phases it may run in. Out of phase it exits 2.
- **Control plane.** A fix may change files under `src/` and nothing else. Any other change
  halts the run: migrations, agent definitions, the hook, the script, `package.json`, lint,
  format, type and test configuration. Files git cannot vouch for (`.env`, `.env.local`,
  `.git/config`, `.git/hooks`) are watched by hash.
- **QA and the reviewer only read.** If `HEAD` moves or a tracked file changes while either is
  working, the run halts.
- **Gates.** The six steps of `npm run verify`, run by the script, not by the developer. When
  they pass the script commits and writes `diff.patch`.
- **Weakened tests and suppressions are listed.** The developer may add and change unit tests.
  Every existing test that lost lines, and every `eslint-disable` or `@ts-ignore` the diff
  adds, is recorded in `gates-<n>.json` for the reviewer and for the person at the pause.
- **Coherent verdicts.** An `APPROVE` with blockers or a `REQUEST_CHANGES` without any is
  rejected.

| Exit code | Meaning                                     |
| --------- | ------------------------------------------- |
| 0         | The step passed                             |
| 1         | The step failed; the run continues          |
| 2         | Misuse: wrong phase, dirty tree, unknown id |
| 3         | The run is halted and needs a person        |

| Halt reason         | Cause                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| `cycle-limit`       | Three developer cycles without an approved fix                               |
| `dev-blocked`       | The fix needs something outside `src/`, or the finding is not a defect       |
| `retest-blocked`    | QA could not reach the app or the screen                                     |
| `control-violation` | Something outside `src/` changed, or the tree moved under QA or the reviewer |

A halted run is not resumed. The branch and the run directory stay for inspection; close it
with `node .agents/bin/run.mjs close` and go back with `git switch main`.

## What each agent may do

[`.claude/hooks/guard.mjs`](../.claude/hooks/guard.mjs) runs before every file, shell and
browser call and applies [`policy.json`](policy.json) by agent. The instructions ask each agent
to stay in its lane; the hook is the part that does not depend on the agent agreeing.

| Agent     | Writes                                                               | Shell                                  | Browser                                    |
| --------- | -------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| QA        | Its report, its retest, findings, `qa/accounts.md`, `qa/coverage.md` | none                                   | `localhost:8081` and the local inbox, only |
| Developer | `src/**` and its notes                                               | read-only git; no network, no database | none                                       |
| Reviewer  | Its review                                                           | none                                   | none                                       |

- No agent can read `.env` or `.env.local`.
- QA cannot run arbitrary code in the browser process or upload files from disk.
- The main session, and any agent the policy does not name, is not restricted.
- If the hook itself fails while judging a named agent, it denies.
- Every decision is logged in `guard.log` in the run directory.

To check that the hook refuses what the policy says:

```bash
node .agents/bin/guard-selftest.mjs
```

## Where things are

```
.agents/
  README.md              this file
  config.json            limits, gate commands, local addresses, watched files
  policy.json            what each agent may write, run and open
  bin/run.mjs            the state machine and every check
  bin/guard-selftest.mjs the hook, tested against the real policy
  templates/             finding, sweep report, dev notes, retest, review
  findings/              one file per finding            (git-ignored)
  runs/<id>/             artifacts of each run           (git-ignored)
  qa/                    QA's test accounts, coverage map and screenshots (git-ignored)
.claude/
  agents/                qa, developer, reviewer
  hooks/guard.mjs        the PreToolUse hook
  skills/                qa-sweep, agent-fix
  settings.json          hook registration and npm permissions
```

Findings, runs and QA's files are not versioned on purpose. This repository is public: a
finding can describe a way to see another person's data, and `qa/accounts.md` holds the
passwords of the local test accounts. Nothing from those directories belongs in a commit, an
issue or a pull request.

QA drives the browser through [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp),
pinned in [`.claude/agents/qa.md`](../.claude/agents/qa.md) and run with `npx` when a sweep
starts. It uses the Edge already installed on the machine, headless, with a fresh profile each
run. It is not a dependency of the project.

## Known limits

- **Not yet run end to end.** The state machine, the hook and `preflight` are tested (see
  below). No sweep and no fix has run with real agents: that needs the local stack. Expect the
  first runs to find problems in the pipeline itself.
- **The format and lint gates look at the whole repository**, not only `src/`. A badly formatted
  file elsewhere fails the gate and the developer cannot fix it.
- **Do not edit anything outside `src/` while a fix is active.** The next `gates` halts the run.
- **`close` does not clean up.** The repository stays on the fix's branch.
- **One run at a time.** A sweep and a fix cannot overlap, and neither can two fixes.
- **QA tests at phone width in one browser.** Safari, a real phone and a screen reader are not
  covered.

What has been checked: `guard-selftest.mjs` (57 cases); a dry run of the sweep and fix state
machines in a throwaway clone, including malformed findings, a failed retest, a contradictory
review, and a halt on a change to `package.json`; and `preflight` against a dev server wired to
the hosted project, which it refused.
