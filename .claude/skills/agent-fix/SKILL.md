---
name: agent-fix
description: Takes one QA finding through Developer → gates → QA retest → Reviewer on its own branch, and stops for the user before anything is pushed. Use when the user asks to fix a finding (F-<number>) or picks findings after a QA sweep.
argument-hint: '<F-id> [--type <commit type>]'
---

# /agent-fix

You are the orchestrator of the fix loop described in `.agents/README.md`. Take the finding
`$ARGUMENTS` through it. Talk to the user in Spanish.

## How this works

Three subagents do the work that needs judgement. One script, `.agents/bin/run.mjs`, owns every
fact: the phase the run is in, the cycle count, whether anyone touched a file outside `src/`,
whether the gates pass. You connect the two: you call the next agent, then the script, then you
do what the script's `RESULT:` line says.

- **The `RESULT:` line is the truth.** An agent's final message is a claim. If `run.mjs` says a
  step failed, it failed, whatever the agent said.
- **You never do an agent's job.** Do not edit anything under `src/` or an artifact in the run
  directory, and do not "quickly fix" a failing gate yourself.
- **You never skip or reorder a step.** The script refuses a command in the wrong phase
  (exit 2). If that happens you lost track: run `node .agents/bin/run.mjs status`.
- **Exit code 3 means the run is halted.** Stop, do not retry, and go to "When the run halts".
- **Pushing, opening a PR and merging are the user's decisions.** You push and open the PR only
  after an explicit yes at the pause. You never merge.

Subagents run in the background here. After starting one, wait for its completion notice before
the next step; never act on what you expect it to have done.

Every agent prompt starts with the same two lines, then only what is listed for that step. Keep
prompts this short on purpose: each agent's instructions are in its own definition, and the
artifacts are the channel between them. Do not summarise one agent's work for another.

```
Run id: <id>
Run directory: .agents/runs/<id>/
```

## Steps

### 1. Prove the app is the local one, then start

QA will retest in the browser, so the same rule as a sweep applies:

```bash
node .agents/bin/run.mjs preflight
node .agents/bin/run.mjs fix-init $ARGUMENTS
```

If `preflight` fails, follow step 1 of the `qa-sweep` skill. If `fix-init` exits 2, relay the
message (uncommitted changes, a run still active, a finding that is not open) and stop. If the
result carries a `warning`, tell the user.

### 2. Developer ↔ gates ↔ QA retest ↔ Reviewer

Repeat until the review is approved or the script halts:

1. `node .agents/bin/run.mjs dev-start` — opens a cycle and prints its number. It halts at the
   limit; the limit is the script's, not yours to extend.
2. Invoke `developer`, adding `Cycle: <n>`. From cycle 2 also name what to read: the previous
   `gates-<n-1>.log` if the gates failed, `retest.md` if QA said `NOT_FIXED`, or `review.md` if
   the reviewer asked for changes.
3. `node .agents/bin/run.mjs gates` — then by `result`:
   - `fail` — back to 1. The developer will read the log.
   - `pass` — the work is committed and `diff.patch` is written. Continue.
4. Invoke `qa`, adding `Mode: retest` and `Cycle: <n>`. The dev server picks the change up by
   itself; if you started the server in this session, check that it is still up first.
5. `node .agents/bin/run.mjs retest-check`
   - `ok: false` — the retest file is malformed; invoke `qa` again with the reasons.
   - `NOT_FIXED` — back to 1.
   - `FIXED` — continue.
6. Invoke `reviewer`, adding `Cycle: <n>`.
7. `node .agents/bin/run.mjs review-check`
   - `ok: false` — the review is malformed; invoke `reviewer` again with the reasons.
   - `REQUEST_CHANGES` — if a blocker is addressed to the person (the right fix lives outside
     `src/`), show it to the user and ask what to do. Otherwise back to 1.
   - `APPROVE` — go to step 3.

### 3. Pause — the user decides on the pull request

Summarise from the artifacts, not from memory:

- the finding in a sentence, and the cause the developer found (`dev-notes.md`);
- what QA saw on the retest, including the other route and the neighbours (`retest.md`);
- the gate results and cycles used (`gates-<n>.json`);
- "Para la persona" and every `minor` finding of the review (`review.md`);
- every entry in `weakened_tests` and `suppressions`, and what the reviewer concluded on each;
- any new finding QA filed while retesting.

Then ask whether to push the branch and open the PR, and wait. Remind the user that the
repository is public: the PR and its description will be too.

On yes: push the branch and open the PR with `gh pr create`, filling
`.github/pull_request_template.md`. The title is a Conventional Commit with a scope from
`CONTRIBUTING.md`; the commits are squashed, so the title is what lands in history. "How to
verify" carries the finding's steps. Never paste a test account's password, an environment
value or a path under `.agents/qa/` into the PR. Give the user the PR link and remind them the
merge is theirs.

Either way, finish with `node .agents/bin/run.mjs close`, which marks the finding `fixed` when
the review approved it, and tell the user which branch they are left on.

## When the run halts

Exit code 3. The `reason` is one of:

- `cycle-limit` — three developer cycles without an approved fix;
- `dev-blocked` — the developer says the fix needs something outside `src/` (a migration, a
  dependency, a product decision), or that the finding is not a defect;
- `retest-blocked` — QA could not reach the app or the screen;
- `control-violation` — something outside `src/` changed, or a tracked file moved while QA or
  the reviewer was working.

Do not try to recover. Give the user a short account of the block: which phase, what the script
reported (`details`), what the last agent artifact says, and what you think the underlying
problem is. For `dev-blocked`, show the "Bloqueo" section of `dev-notes.md` in full: it is the
description of the work a person has to do. Point to `guard.log` in the run directory if an
agent was refused something. The branch and the run directory stay as they are for the user to
inspect; mention `node .agents/bin/run.mjs close` and `git switch main` for when they are done.
