/**
 * Searching the help file (Ayuda v1 · 5), on the phone: accents and case
 * folded, question first, then the answer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { HelpQuestion } from '../content/help.es';
import { toApiError } from './errors';

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Questions whose words match, questions matched in the title first. */
export function searchHelp(questions: readonly HelpQuestion[], query: string): HelpQuestion[] {
  const words = fold(query)
    .split(/\s+/u)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const scored = questions
    .map((q) => {
      const title = fold(q.question);
      const body = fold(q.answer.join(' '));
      const inTitle = words.filter((w) => title.includes(w)).length;
      const inBody = words.filter((w) => body.includes(w)).length;
      return {
        q,
        score: inTitle * 2 + inBody,
        all: words.every((w) => title.includes(w) || body.includes(w)),
      };
    })
    .filter((x) => x.all)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.q);
}

export type HelpReason = 'no_responde' | 'no_se_entiende' | 'desactualizado';

export const HELP_REASONS: { id: HelpReason; label: string }[] = [
  { id: 'no_responde', label: 'No responde mi pregunta' },
  { id: 'no_se_entiende', label: 'No se entiende' },
  { id: 'desactualizado', label: 'Está desactualizado' },
];

/** «¿Te sirvió?» (0047): question, yes/no, and the reason when no. Nothing else. */
export async function recordHelpFeedback(
  db: SupabaseClient,
  questionId: string,
  helpful: boolean,
  reason?: HelpReason,
): Promise<void> {
  const { error } = await db.rpc('record_help_feedback', {
    p_question_id: questionId,
    p_helpful: helpful,
    p_reason: helpful ? null : (reason ?? null),
  });
  if (error) throw toApiError(error);
}
