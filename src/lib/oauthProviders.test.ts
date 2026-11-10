import { describe, expect, it } from 'vitest';

import { enabledProviders } from './oauthProviders';

const names = (raw: string | undefined) => enabledProviders(raw).map((p) => p.provider);

describe('enabledProviders', () => {
  it('shows nothing until somebody says a provider is on', () => {
    expect(names(undefined)).toEqual([]);
    expect(names('')).toEqual([]);
    expect(names(' , ')).toEqual([]);
  });

  it('shows only what is named', () => {
    expect(names('google')).toEqual(['google']);
    expect(names('apple')).toEqual(['apple']);
  });

  it('keeps Apple first whatever the order written', () => {
    expect(names('google,apple')).toEqual(['apple', 'google']);
  });

  it('forgives spaces and capitals, and ignores names it does not know', () => {
    expect(names(' Google , facebook')).toEqual(['google']);
  });
});
