#!/usr/bin/env node
/**
 * Fails if voseo reaches a screen.
 *
 * `docs/product.md` settles the voice as `tú`. The audit of 15 September
 * claimed "zero voseo occurrences in src/" on the strength of a hand-written
 * list of verb forms — and the list missed fourteen, three of which were
 * written that same day, in the same session that claimed to have removed
 * them. A statement true when written and never re-checked is this
 * repository's most frequent defect; the only defence that has worked is a
 * check that fails.
 *
 * Two rules, and they are not equally strong. Say so rather than imply
 * otherwise:
 *
 *   1. INDICATIVE — shaped, and therefore trustworthy. Voseo present
 *      indicative is a stressed final syllable: `-ás`, `-és`, `-ís`
 *      (`dejás`, `perdés`, `salís`). Ordinary Spanish lands there too
 *      (`más`, `después`, `país`), so those are allow-listed by name. An
 *      allow-list of words that are fine is safe to extend; it is the
 *      deny-list that failed.
 *
 *   2. IMPERATIVE — a list, and therefore only as good as the list. Voseo
 *      imperative is a bare stressed vowel (`dejá`, `poné`, `salí`), a shape
 *      shared with half the dictionary: `día`, `café`, `aquí`, `mamá`. There
 *      is no rule that separates them without knowing which words are verbs,
 *      so this half enumerates. **If you add copy with an imperative this
 *      list does not carry, nothing will complain.** Add it when you notice.
 *
 *   3. ENCLITIC — derived from rule 2, so it inherits the list's reach and
 *      nothing more. A pronoun attached to a voseo imperative takes the
 *      stress without an accent: `agregá` + `lo` is `agregalo`, `escribí` +
 *      `me` is `escribime`. The `tú` form of the same word is always
 *      different — accented (`agrégalo`, `escríbeme`) or a different stem
 *      (`dime`, `hazlo`) — so an imperative from the list with its accent
 *      removed and a pronoun after it is voseo and nothing else. Every
 *      accented entry in rule 2 gets this for free.
 *
 * On 18 September this file reported "clean" over fifteen occurrences in
 * six files: eight from four imperatives the list did not carry, and seven
 * enclitic forms no rule covered. A search by hand the same morning found
 * fourteen and missed `escribile`; rule 3 found it on its first run. The
 * list grew, and rule 3 exists, because of that.
 *
 * Run by `npm run verify` and by CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';

const LETTER = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]';

/** Rule 1: a stressed `-ás` / `-és` / `-ís` at the end of a word. */
const INDICATIVE = new RegExp(`(?<!${LETTER})${LETTER}+(?:ás|és|ís)(?!${LETTER})`, 'gu');

/** Ordinary Spanish that ends the same way. Compared lowercased. */
const ALLOWED = new Set([
  'más',
  'demás',
  'además',
  'atrás',
  'jamás',
  'quizás',
  'después',
  'revés',
  'través',
  'inglés',
  'francés',
  'mes',
  'país',
  'estás', // `tú estás` — the same word in both voices
  // Rule 3 reads identifiers too, and English collides with it: `creá` + `te`
  // is `create`, as in `StyleSheet.create`.
  'create',
]);

/**
 * Rule 2: the imperatives. Enumerated, for the reason given above.
 */
const IMPERATIVES = [
  'vení',
  'andá',
  'mirá',
  'dejá',
  'poné',
  'tené',
  'hacé',
  'decí',
  'salí',
  'entrá',
  'escribí',
  'compartí',
  'elegí',
  'guardá',
  'creá',
  'buscá',
  'probá',
  'contá',
  'avisá',
  'revisá',
  'esperá',
  'volvé',
  'mandá',
  'llevá',
  'traé',
  'pedí',
  'abrí',
  'cerrá',
  'marcá',
  'tocá',
  'cambiá',
  'agregá',
  'borrá',
  'subí',
  'bajá',
  // Added 18 September, found in copy the check had passed.
  'cancelá',
  'publicá',
  'pegá',
  'copiá',
];

/**
 * The pronouns, and enclitic forms whose imperative is not in the list
 * above — rule 3 derives the rest.
 */
const OTHER = [
  'vos',
  'sos',
  'contame',
  'contanos',
  'avisanos',
  'apuntate',
  'unite',
  'fijate',
  'acordate',
  'sentate',
  'quedate',
];

const LISTED = new RegExp(
  `(?<!${LETTER})(?:${[...IMPERATIVES, ...OTHER].join('|')})(?!${LETTER})`,
  'giu',
);

/** Rule 3: `agregá` → `agregalo`. Strip the accent, allow a pronoun after it. */
const stripAccent = (word) =>
  word
    .normalize('NFD')
    .replace(/\u0301/g, '')
    .normalize('NFC');
const ENCLITIC = new RegExp(
  `(?<!${LETTER})(?:${IMPERATIVES.map(stripAccent).join('|')})(?:lo|la|los|las|le|les|me|nos|te)(?!${LETTER})`,
  'giu',
);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out.sort();
}

const findings = [];

for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Comments cite the forms in order to explain the rule. They are not copy.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

    for (const match of line.matchAll(INDICATIVE)) {
      if (ALLOWED.has(match[0].toLowerCase())) continue;
      findings.push({ file, line: i + 1, word: match[0], text: trimmed });
    }
    for (const match of line.matchAll(LISTED)) {
      findings.push({ file, line: i + 1, word: match[0], text: trimmed });
    }
    for (const match of line.matchAll(ENCLITIC)) {
      if (ALLOWED.has(match[0].toLowerCase())) continue;
      findings.push({ file, line: i + 1, word: match[0], text: trimmed });
    }
  });
}

if (findings.length === 0) {
  console.log(`voice: clean — no voseo in ${ROOT}/`);
  process.exit(0);
}

console.error(`voice: ${findings.length} occurrence(s) of voseo in ${ROOT}/\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.word}`);
  console.error(`      ${f.text.slice(0, 96)}`);
}
console.error(
  '\nThe voice is `tú` — see docs/product.md, which explains why.\n' +
    'Rewrite the string. If the word is ordinary Spanish rather than a verb,\n' +
    'add it to ALLOWED in this file instead.',
);
process.exit(1);
