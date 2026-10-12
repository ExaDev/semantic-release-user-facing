import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { readPluginConfig } from '../src/options.js';

describe('readPluginConfig', () => {
  it('defaults to no overrides and delegates every other key unchanged', () => {
    const { rules, delegated } = readPluginConfig({ preset: 'angular', releaseRules: [{ type: 'docs', release: 'patch' }] });

    expect(rules).toEqual({ include: [], exclude: [] });
    expect(delegated).toEqual({ preset: 'angular', releaseRules: [{ type: 'docs', release: 'patch' }] });
  });

  it('strips userFacing before delegating', () => {
    const { rules, delegated } = readPluginConfig({ preset: 'angular', userFacing: { include: ['README.md'] } });

    expect(rules).toEqual({ include: ['README.md'], exclude: [] });
    expect(delegated).toEqual({ preset: 'angular' });
  });

  it('accepts the empty options semantic-release passes when none are configured', () => {
    expect(readPluginConfig({}).rules).toEqual({ include: [], exclude: [] });
  });

  it('rejects an unknown key under userFacing', () => {
    expect(() => readPluginConfig({ userFacing: { includ: ['a'] } })).toThrow(ZodError);
  });

  it('rejects globs that are not strings', () => {
    expect(() => readPluginConfig({ userFacing: { include: [1] } })).toThrow(ZodError);
  });
});
