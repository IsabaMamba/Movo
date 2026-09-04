## What and why

<!-- One paragraph: what changes, and the problem it solves. Link the issue. -->

Closes #

## How to verify

<!-- Exact steps a reviewer runs. Include the screen or the SQL, not just "tested locally". -->

1.
2.

## Acceptance criteria

- [ ]
- [ ]

## Checklist

- [ ] PR title follows Conventional Commits (it becomes the squashed commit subject)
- [ ] `npm run verify` passes
- [ ] Database changes ship as a new numbered migration — existing migrations are never edited
- [ ] New tables have RLS enabled and a policy; new participation writes go through an RPC
- [ ] Docs updated (README, ADR, or `docs/`) if behaviour or setup changed
- [ ] No secrets, service-role keys, or real user data in the diff

## Screenshots

<!-- Required for any UI change. Before and after. -->
