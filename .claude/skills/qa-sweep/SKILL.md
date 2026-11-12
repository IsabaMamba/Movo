---
name: qa-sweep
description: Sends the QA agent through one area of the running Movo app in a real browser, against the local Supabase stack, and brings back a list of findings for the user to triage. Use when the user asks for a QA sweep, a QA pass, or to have QA test the app or one of its areas.
argument-hint: '<area | auto>'
---

# /qa-sweep

You are the orchestrator of the QA sweep described in `.agents/README.md`. Sweep the area
`$ARGUMENTS` (use `auto` when none was given). Talk to the user in Spanish.

## How this works

The `qa` agent does the testing. One script, `.agents/bin/run.mjs`, owns the facts: whether the
app under test is wired to the local database, which findings were filed, whether they are well
formed, whether anything in the repository changed. You call the script, then the agent, then
the script again, and you act on the script's `RESULT:` line.

- **The `RESULT:` line is the truth.** The agent's final message is a claim.
- **You never do QA's job.** Do not open the app yourself to "confirm" a finding, and do not
  edit a finding or the report.
- **Never sweep against the hosted project.** If `preflight` fails you stop. You do not edit
  `.env`, and you do not try another address.
- **Exit code 3 means the run is halted.** Stop and tell the user what the script reported.

Subagents run in the background here. After starting one, wait for its completion notice before
the next step; never act on what you expect it to have done.

## Steps

### 1. Prove the app is the local one

```bash
node .agents/bin/run.mjs preflight
```

On `ok: false`, relay each reason and help with the one thing it names:

- no `.env.local` — the local stack has to be running first (`npx supabase start`, which needs
  Docker Desktop open), then `node .agents/bin/run.mjs local-env`;
- local Supabase not answering — ask the user to start it; you do not install or start Docker;
- dev server not answering — start it (the `movo-web` preview configuration in
  `.claude/launch.json`, or ask the user to run `npx expo start --web --clear`);
- the bundle is wired to the hosted project — the dev server has to be restarted with
  `--clear` so it picks up `.env.local`.

Run `preflight` again after each fix. Do not go on until it passes.

### 2. Open the sweep

```bash
node .agents/bin/run.mjs sweep-start $ARGUMENTS
```

Note `first_finding` and `max_findings` from the result.

### 3. QA

Invoke the `qa` agent with exactly this, and nothing about what you expect it to find:

```
Run id: <id>
Run directory: .agents/runs/<id>/
Mode: sweep
Area: <area>
First finding number: <first_finding>
```

### 4. Check what came back

```bash
node .agents/bin/run.mjs sweep-check
```

- `ok: false` — invoke `qa` again with the same prompt plus the reasons verbatim. If it fails a
  second time, show the user the reasons and ask how to proceed.
- `verdict: BLOCKED` — show the user "Motivo del bloqueo" from `report.md`, close, and stop.

### 5. Triage with the user

Read `report.md` and the findings, and present, from the files and not from memory:

- what was walked and what works;
- the findings as a table: id, severity, title, each linked to its file under
  `.agents/findings/`;
- what QA could not test, and its "Preguntas" for the user;
- if QA picked the area itself, which one and why.

Then ask which findings to fix. Say plainly which ones look like they need a database change
(a policy, an RPC): the developer agent cannot write migrations, so those will come back as
blocked with a description of what is needed.

The findings stay in `.agents/findings/`, which is not versioned. The repository is public, so
do not open GitHub issues from them unless the user asks, and never for a finding about
security or about who can see whose data.

### 6. Close

```bash
node .agents/bin/run.mjs close
```

Then, for each finding the user chose, in order of severity, run the `agent-fix` skill with its
id. One at a time: each fix works on its own branch from a clean tree.
