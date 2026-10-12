import { describe, expect, it } from 'vitest';
import { consumerFacingManifestFields, manifestChangeIsUserFacing } from '../src/manifest.js';

const base = {
  name: 'pkg',
  version: '1.0.0',
  dependencies: { a: '1.0.0' },
  devDependencies: { b: '1.0.0' },
  scripts: { test: 'vitest' },
  exports: { '.': './dist/index.js' },
};

describe('manifestChangeIsUserFacing', () => {
  it('is false when nothing changed', () => {
    expect(manifestChangeIsUserFacing(base, structuredClone(base))).toBe(false);
  });

  it.each([
    ['devDependencies', { ...base, devDependencies: { b: '2.0.0' } }],
    ['scripts', { ...base, scripts: { test: 'jest' } }],
    ['version', { ...base, version: '2.0.0' }],
    ['description', { ...base, description: 'new' }],
  ])('is false for a change to %s only', (_field, after) => {
    expect(manifestChangeIsUserFacing(base, after)).toBe(false);
  });

  it('is true for a change to a runtime dependency', () => {
    expect(manifestChangeIsUserFacing(base, { ...base, dependencies: { a: '2.0.0' } })).toBe(true);
  });

  it('is true for a change nested inside exports', () => {
    expect(manifestChangeIsUserFacing(base, { ...base, exports: { '.': './dist/main.js' } })).toBe(true);
  });

  it('is true when a consumer-facing field is added', () => {
    expect(manifestChangeIsUserFacing(base, { ...base, bin: { tool: './bin.js' } })).toBe(true);
  });

  it('is true when a consumer-facing field is removed', () => {
    const without = Object.fromEntries(Object.entries(base).filter(([field]) => field !== 'exports'));

    expect(manifestChangeIsUserFacing(base, without)).toBe(true);
  });

  it('is true when the manifest is added', () => {
    expect(manifestChangeIsUserFacing(undefined, base)).toBe(true);
  });

  it('is true when the manifest is deleted', () => {
    expect(manifestChangeIsUserFacing(base, undefined)).toBe(true);
  });

  it.each(consumerFacingManifestFields)('treats a change to %s as user-facing', (field) => {
    expect(manifestChangeIsUserFacing({}, { [field]: 'changed' })).toBe(true);
  });
});
