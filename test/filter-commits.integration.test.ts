import { afterEach, describe, expect, it } from 'vitest';
import { filterUserFacingCommits } from '../src/filter-commits.js';
import { createGitReader } from '../src/git.js';
import type { UserFacingRules } from '../src/options.js';
import { createTestRepo, type TestRepo } from './helpers/repo.js';

const manifest = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    dependencies: { left: '1.0.0' },
    devDependencies: { tool: '1.0.0' },
    scripts: { test: 'run' },
    ...overrides,
  });

async function writeBaseline(repo: TestRepo): Promise<void> {
  await repo.write('src/a.ts', 'a');
  await repo.write('test/a.test.ts', 'a');
  await repo.write('README.md', 'a');
  await repo.write('package.json', manifest());
  await repo.write('pnpm-lock.yaml', 'a');
  await repo.commit('chore: baseline');
}

interface Scenario {
  readonly name: string;
  readonly rules?: UserFacingRules;
  /** Applies the change under test to a repository holding the baseline and commits it, returning the commit's hash. */
  readonly change: (repo: TestRepo) => Promise<string>;
  readonly userFacing: boolean;
}

const scenarios: readonly Scenario[] = [
  {
    name: 'a source change',
    userFacing: true,
    async change(repo) {
      await repo.write('src/a.ts', 'changed');

      return repo.commit('feat: source');
    },
  },
  {
    name: 'a test-only change',
    userFacing: false,
    async change(repo) {
      await repo.write('test/a.test.ts', 'changed');

      return repo.commit('feat: tests');
    },
  },
  {
    name: 'a documentation-only change',
    userFacing: false,
    async change(repo) {
      await repo.write('README.md', 'changed');

      return repo.commit('feat: docs');
    },
  },
  {
    name: 'a source and test change together',
    userFacing: true,
    async change(repo) {
      await repo.write('src/a.ts', 'changed');
      await repo.write('test/a.test.ts', 'changed');

      return repo.commit('fix: both');
    },
  },
  {
    name: 'a CI-only change',
    userFacing: false,
    async change(repo) {
      await repo.write('.github/workflows/ci.yml', 'on: push');

      return repo.commit('ci: workflow');
    },
  },
  {
    name: 'a lockfile-only change',
    userFacing: false,
    async change(repo) {
      await repo.write('pnpm-lock.yaml', 'changed');

      return repo.commit('chore: lock');
    },
  },
  {
    name: 'a devDependencies-only manifest change',
    userFacing: false,
    async change(repo) {
      await repo.write('package.json', manifest({ devDependencies: { tool: '2.0.0' } }));

      return repo.commit('chore: bump dev tool');
    },
  },
  {
    name: 'a scripts-only manifest change',
    userFacing: false,
    async change(repo) {
      await repo.write('package.json', manifest({ scripts: { test: 'other' } }));

      return repo.commit('chore: scripts');
    },
  },
  {
    name: 'a runtime dependency manifest change',
    userFacing: true,
    async change(repo) {
      await repo.write('package.json', manifest({ dependencies: { left: '2.0.0' } }));

      return repo.commit('fix: bump dependency');
    },
  },
  {
    name: 'a new nested package manifest',
    userFacing: true,
    async change(repo) {
      await repo.write('packages/b/package.json', manifest({ name: 'b' }));

      return repo.commit('feat: add package');
    },
  },
  {
    name: 'a fixture manifest under a test directory',
    userFacing: false,
    async change(repo) {
      await repo.write('test/fixtures/app/package.json', manifest({ name: 'fixture-app' }));

      return repo.commit('test: fixture');
    },
  },
  {
    name: 'a file moved out of the source tree into tests',
    userFacing: true,
    async change(repo) {
      await repo.git('mv', 'src/a.ts', 'test/moved.test.ts');

      return repo.commit('refactor: move');
    },
  },
  {
    name: 'a deleted source file',
    userFacing: true,
    async change(repo) {
      await repo.git('rm', '--quiet', 'src/a.ts');

      return repo.commit('fix: remove');
    },
  },
  {
    name: 'an empty commit',
    userFacing: true,
    async change(repo) {
      return repo.commit('fix: force a release');
    },
  },
  {
    name: 'a README change promoted by include',
    rules: { include: ['README.md'], exclude: [] },
    userFacing: true,
    async change(repo) {
      await repo.write('README.md', 'changed');

      return repo.commit('docs: readme');
    },
  },
  {
    name: 'a generated source change demoted by exclude',
    rules: { include: [], exclude: ['src/generated/**'] },
    userFacing: false,
    async change(repo) {
      await repo.write('src/generated/schema.ts', 'generated');

      return repo.commit('feat: regenerate');
    },
  },
  {
    name: 'a path matching both include and exclude',
    rules: { include: ['src/generated/keep.ts'], exclude: ['src/generated/**'] },
    userFacing: true,
    async change(repo) {
      await repo.write('src/generated/keep.ts', 'kept');

      return repo.commit('feat: keep');
    },
  },
  {
    name: 'a merge commit that brings in a source change',
    userFacing: true,
    async change(repo) {
      await repo.git('checkout', '--quiet', '-b', 'side');
      await repo.write('src/b.ts', 'b');
      await repo.commit('feat: side');
      await repo.git('checkout', '--quiet', 'main');
      await repo.write('test/a.test.ts', 'main-only');
      await repo.commit('test: main');
      await repo.git('merge', '--quiet', '--no-ff', 'side', '--message', 'Merge side');

      return repo.git('rev-parse', 'HEAD');
    },
  },
  {
    name: 'a merge commit that brings in only a test change',
    userFacing: false,
    async change(repo) {
      await repo.git('checkout', '--quiet', '-b', 'side');
      await repo.write('test/b.test.ts', 'b');
      await repo.commit('test: side');
      await repo.git('checkout', '--quiet', 'main');
      await repo.write('src/a.ts', 'main-only');
      await repo.commit('feat: main');
      await repo.git('merge', '--quiet', '--no-ff', 'side', '--message', 'Merge side');

      return repo.git('rev-parse', 'HEAD');
    },
  },
];

describe('filterUserFacingCommits over a real repository', () => {
  const repos: TestRepo[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map(async (repo) => repo.dispose()));
  });

  it.each(scenarios)('$name', async ({ change, rules, userFacing }) => {
    const repo = await createTestRepo();
    repos.push(repo);
    await writeBaseline(repo);
    const hash = await change(repo);
    const commit = await repo.asCommit(hash);

    const kept = await filterUserFacingCommits(
      [commit],
      rules ?? { include: [], exclude: [] },
      createGitReader({ cwd: repo.directory, env: repo.env }),
    );

    expect(kept.map(({ hash: keptHash }) => keptHash)).toEqual(userFacing ? [hash] : []);
  });

  it('keeps the root commit when it adds a source file', async () => {
    const repo = await createTestRepo();
    repos.push(repo);
    await repo.write('src/a.ts', 'a');
    const hash = await repo.commit('feat: init');

    const kept = await filterUserFacingCommits(
      [await repo.asCommit(hash)],
      { include: [], exclude: [] },
      createGitReader({ cwd: repo.directory, env: repo.env }),
    );

    expect(kept.map(({ hash: keptHash }) => keptHash)).toEqual([hash]);
  });

  it('keeps commits in their original order across a mixed history', async () => {
    const repo = await createTestRepo();
    repos.push(repo);
    await writeBaseline(repo);
    await repo.write('src/a.ts', 'one');
    const first = await repo.commit('feat: one');
    await repo.write('test/a.test.ts', 'two');
    const second = await repo.commit('feat: two');
    await repo.write('src/a.ts', 'three');
    const third = await repo.commit('fix: three');
    const commits = await Promise.all([first, second, third].map(async (hash) => repo.asCommit(hash)));

    const kept = await filterUserFacingCommits(
      commits,
      { include: [], exclude: [] },
      createGitReader({ cwd: repo.directory, env: repo.env }),
    );

    expect(kept.map(({ hash }) => hash)).toEqual([first, third]);
  });
});
