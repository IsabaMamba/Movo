#!/usr/bin/env node
/**
 * Fails if a migration exists that `docs/status.md` does not name.
 *
 * It checks names, not a count, and the difference is the whole point.
 *
 * The first version of this script counted the number word in the prose —
 * "all ten migrations are applied" — and compared it to the file count. It
 * failed the *corrected* sentence, because "ten migrations are applied" is a
 * true statement about what is deployed and a false-looking one about what is
 * in the directory. A checker cannot tell those apart; only a person reading
 * the sentence can.
 *
 * So the count came out of the prose. `docs/status.md` carries a table with a
 * row per migration, and this asserts every file has a row. A name either
 * appears or it does not, and nothing about deployment has to be inferred.
 *
 * What this deliberately does NOT check: whether a migration marked "applied"
 * is actually applied to the live Supabase project. CI has no credentials for
 * it and should not. That column is maintained by hand and is the one part of
 * the table worth distrusting.
 *
 * This exists because the same paragraph has been wrong twice — a migration
 * count, and before it a table count of nine against a schema with sixteen.
 *
 * Rows name the whole file stem, `0012_staff_reports`, not `0012`. The first
 * version matched four digits, and the table beside them described 0002 as
 * "RLS policies", 0004 as "Participation RPCs", 0006 as "Groups" and 0007 as
 * "Reports and blocking": four descriptions of files that are functions, a
 * category seed, a venue seed and a group-owner trigger. A stem puts what the
 * file is called beside the prose describing it. The What column is still
 * prose, and still read by a person.
 */

import { readFileSync, readdirSync } from 'node:fs';

const STATUS = 'docs/status.md';
const MIGRATIONS = 'supabase/migrations';

/** `0011_notification_read_grant.sql` → `0011_notification_read_grant` */
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.slice(0, -'.sql'.length))
  .sort();

const text = readFileSync(STATUS, 'utf8');

/** A row names it by its full stem, backticked, so prose mentioning 0011 does not count. */
const named = new Set(Array.from(text.matchAll(/`(\d{4}_[a-z0-9_]+)`/gu), (m) => m[1]));

const missing = files.filter((id) => !named.has(id));
const phantom = [...named].filter((id) => !files.includes(id));

if (missing.length === 0 && phantom.length === 0) {
  console.log(`migrations: all ${files.length} named in ${STATUS}`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`migrations: ${missing.length} migration(s) missing from ${STATUS}\n`);
  for (const id of missing) {
    console.error(`  ${id}.sql  — add a row to the Migrations table, with whether it is applied`);
  }
}

if (phantom.length > 0) {
  console.error(`\nmigrations: ${STATUS} names ${phantom.length} that do not exist:\n`);
  for (const id of phantom) console.error(`  \`${id}\``);
}

process.exit(1);
