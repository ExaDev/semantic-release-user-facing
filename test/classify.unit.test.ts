import { describe, expect, it } from 'vitest';
import { createPathClassifier } from '../src/classify.js';

const noRules = { include: [], exclude: [] };

describe('createPathClassifier defaults', () => {
  const verdictOf = createPathClassifier(noRules);

  it.each([
    'src/index.ts',
    'lib/a/b.js',
    'bin/cli',
    'LICENSE',
    'tsconfig.json',
    'tsdown.config.ts',
    'packages/a/src/x.ts',
    '.env.example',
  ])('treats %s as user-facing', (path) => {
    expect(verdictOf(path)).toBe('user-facing');
  });

  it.each([
    'src/a.test.ts',
    'src/deep/a.spec.tsx',
    'src/__tests__/a.ts',
    'src/__mocks__/a.ts',
    'test/helper.ts',
    'tests/a/b.ts',
    'packages/a/test/x.ts',
    'README.md',
    'docs/guide.txt',
    'packages/a/CHANGELOG.md',
    '.github/workflows/ci.yml',
    '.husky/pre-commit',
    '.vscode/settings.json',
    '.changeset/a.md',
    'pnpm-lock.yaml',
    'packages/a/package-lock.json',
    'yarn.lock',
    'bun.lock',
    '.editorconfig',
    '.gitignore',
    '.prettierrc.json',
    'eslint.config.ts',
    'packages/a/vitest.config.ts',
    'release.config.ts',
    '.releaserc.json',
  ])('treats %s as non-user-facing', (path) => {
    expect(verdictOf(path)).toBe('non-user-facing');
  });

  it.each(['package.json', 'packages/a/package.json'])('defers %s to a content check', (path) => {
    expect(verdictOf(path)).toBe('manifest');
  });

  it('classifies a fixture manifest under a test directory by path, not content', () => {
    expect(verdictOf('test/fixtures/app/package.json')).toBe('non-user-facing');
  });

  it('does not treat a file merely named like the manifest as one', () => {
    expect(verdictOf('src/not-package.json')).toBe('user-facing');
  });
});

describe('createPathClassifier overrides', () => {
  it('lets include promote a default non-shipping path', () => {
    const verdictOf = createPathClassifier({ include: ['README.md'], exclude: [] });

    expect(verdictOf('README.md')).toBe('user-facing');
    expect(verdictOf('docs/other.md')).toBe('non-user-facing');
  });

  it('lets exclude demote a path that would be user-facing', () => {
    const verdictOf = createPathClassifier({ include: [], exclude: ['src/generated/**'] });

    expect(verdictOf('src/generated/schema.ts')).toBe('non-user-facing');
    expect(verdictOf('src/schema.ts')).toBe('user-facing');
  });

  it('lets include beat exclude when a path matches both', () => {
    const verdictOf = createPathClassifier({ include: ['src/generated/keep.ts'], exclude: ['src/generated/**'] });

    expect(verdictOf('src/generated/keep.ts')).toBe('user-facing');
    expect(verdictOf('src/generated/drop.ts')).toBe('non-user-facing');
  });

  it('lets an explicit exclude settle a manifest without reading it', () => {
    const verdictOf = createPathClassifier({ include: [], exclude: ['examples/**'] });

    expect(verdictOf('examples/app/package.json')).toBe('non-user-facing');
  });

  it('lets an explicit include settle a manifest without reading it', () => {
    const verdictOf = createPathClassifier({ include: ['package.json'], exclude: [] });

    expect(verdictOf('package.json')).toBe('user-facing');
  });

  it('matches dotfiles', () => {
    const verdictOf = createPathClassifier({ include: [], exclude: ['.config/**'] });

    expect(verdictOf('.config/tool.json')).toBe('non-user-facing');
  });
});
