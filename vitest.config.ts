import { defineConfig } from 'vitest/config';

/**
 * Unit tests for pure functions only.
 *
 * Deliberately no jsdom, no React Native preset and no component rendering.
 * Testing a React Native screen in Node means mocking the whole platform, and a
 * suite built on mocks tells you the mocks agree with each other. The functions
 * covered here take values and return values — money formatting, occupancy
 * bands, coordinate parsing, notification copy — and every one of them is a
 * place a wrong answer reaches a person silently.
 *
 * What still has no automated coverage, honestly: every screen. The database
 * suite covers the invariants, this covers the arithmetic, and the middle —
 * whether a screen wires them together correctly — is still checked by a person
 * using the app.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
