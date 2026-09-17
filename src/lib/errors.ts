/**
 * One place where a Postgres error becomes something a screen can act on.
 *
 * This lived inside `activities.ts` as a module-private function. When
 * `notifications.ts` needed it, it was copied, with a comment saying to lift it
 * out on the third caller. `reports.ts` was the third caller and copied it
 * again, with a comment saying the same thing. Three copies of a mapping means
 * three places a new SQLSTATE stops being translated, and two of them fail
 * quietly — a `kind` of `'unknown'` renders as a generic message rather than as
 * an error.
 *
 * Every RPC in `supabase/migrations/` raises with these codes deliberately, so
 * this table is the client half of a contract the database keeps:
 *
 *   42501  the caller is not allowed — wrong person, or no session at all
 *   P0002  the row does not exist
 *   22023  the row exists and the operation is not valid for its current state
 *
 * The third is the interesting one. `invalid_state` is not a bug and not a
 * permissions problem: it is the database refusing something that was legal a
 * moment ago and is not now — a session that already started, a report somebody
 * else just resolved, a series that was cancelled while the screen was open.
 * Screens are expected to show its message, because the message says which.
 */

export type ApiErrorKind =
  'unauthenticated' | 'forbidden' | 'not_found' | 'invalid_state' | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
  }
}

/** Anything PostgREST or postgres-js hands back: a message, sometimes a code. */
export interface PostgresErrorLike {
  code?: string;
  message: string;
}

export function toApiError(error: PostgresErrorLike): ApiError {
  switch (error.code) {
    case '42501':
      return new ApiError('forbidden', error.message, error.code);
    case 'P0002':
      return new ApiError('not_found', error.message, error.code);
    case '22023':
      return new ApiError('invalid_state', error.message, error.code);
    default:
      return new ApiError('unknown', error.message, error.code);
  }
}
