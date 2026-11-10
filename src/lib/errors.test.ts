import { describe, expect, it } from 'vitest';

import { ApiError, isNotFound, toApiError } from './errors';

describe('toApiError', () => {
  it('keeps the contract with the database', () => {
    expect(toApiError({ code: '42501', message: 'no' }).kind).toBe('forbidden');
    expect(toApiError({ code: 'P0002', message: 'no' }).kind).toBe('not_found');
    expect(toApiError({ code: '22023', message: 'no' }).kind).toBe('invalid_state');
    expect(toApiError({ message: 'boom' }).kind).toBe('unknown');
  });

  it('reads an id that is not an id as a row that does not exist', () => {
    const error = toApiError({
      code: '22P02',
      message: 'invalid input syntax for type uuid: "abc"',
    });
    expect(error.kind).toBe('not_found');
    expect(error.code).toBe('22P02');
  });

  it('carries the message, which screens show for invalid_state', () => {
    expect(toApiError({ code: '22023', message: 'La sesión ya empezó.' }).message).toBe(
      'La sesión ya empezó.',
    );
  });
});

describe('isNotFound', () => {
  it('is true only for a not_found ApiError', () => {
    expect(isNotFound(new ApiError('not_found', 'x'))).toBe(true);
    expect(isNotFound(new ApiError('forbidden', 'x'))).toBe(false);
    expect(isNotFound(new Error('not found'))).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});
