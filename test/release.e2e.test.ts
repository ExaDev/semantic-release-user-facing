import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import semanticRelease from 'semantic-release';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestRepo, type TestRepo } from './helpers/repo.js';

const distribution = join(import.meta.dirname, '..', 'dist');
const analyzerEntry = join(distribution, 'index.js');
const notesEntry = join(distribution, 'notes.js');

/**
 * A repository whose `main` is pushed to a bare remote and tagged `v1.0.0` at the baseline, so a dry run has a last release to count commits from.
 */
async function createReleasableRepo(): Promise<{ repo: TestRepo; remote: TestRepo }> {
  const remote = await createTestRepo();
  await remote.git('config', 'receive.denyCurrentBranch', 'ignore');
  const repo = await createTestRepo();
  await repo.write('src/a.ts', 'a');
  await repo.write('package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await repo.commit('feat: baseline');
  await repo.git('tag', 'v1.0.0');
  await repo.git('remote', 'add', 'origin', remote.directory);
  await repo.git('push', '--quiet', 'origin', 'main', '--tags');

  return { repo, remote };
}

async function dryRun(repo: TestRepo, remote: TestRepo, pluginOptions: Record<string, unknown> = {}) {
  return semanticRelease(
    {
      branches: ['main'],
      // A URL, not a bare path: the stock release notes generator parses the repository URL to build commit and compare links.
      repositoryUrl: pathToFileURL(remote.directory).href,
      plugins: [
        [analyzerEntry, pluginOptions],
        [notesEntry, pluginOptions],
      ],
      dryRun: true,
      ci: false,
    },
    { cwd: repo.directory, env: repo.env },
  );
}

describe('a semantic-release dry run with both entry points', () => {
  const repos: TestRepo[] = [];
  const hookEnvironment = new Map<string, string>();

  // semantic-release runs git through execa, which merges the process environment over the `env` passed in the context, so a `GIT_DIR` set by the pre-push hook would send its fetches to the outer repository. The variables are removed from the process for this suite and restored afterwards.
  beforeAll(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        hookEnvironment.set(key, value);
        Reflect.deleteProperty(process.env, key);
      }
    }
  });

  afterAll(() => {
    for (const [key, value] of hookEnvironment) {
      process.env[key] = value;
    }
  });

  afterEach(async () => {
    await Promise.all(repos.splice(0).map(async (repo) => repo.dispose()));
  });

  async function setup(): Promise<{ repo: TestRepo; remote: TestRepo }> {
    const pair = await createReleasableRepo();
    repos.push(pair.repo, pair.remote);

    return pair;
  }

  it('releases nothing for a feat that only touches tests', async () => {
    const { repo, remote } = await setup();
    await repo.write('test/a.test.ts', 'new');
    await repo.commit('feat: add tests');

    expect(await dryRun(repo, remote)).toBe(false);
  });

  it('releases a minor for a feat that touches source', async () => {
    const { repo, remote } = await setup();
    await repo.write('src/b.ts', 'b');
    await repo.commit('feat: add b');

    const result = await dryRun(repo, remote);

    expect(result).not.toBe(false);
    expect(result === false ? undefined : result.nextRelease.version).toBe('1.1.0');
  });

  it('leaves a test-only commit out of the notes but keeps the source commit', async () => {
    const { repo, remote } = await setup();
    await repo.write('test/a.test.ts', 'new');
    await repo.commit('feat: test only change');
    await repo.write('src/b.ts', 'b');
    await repo.commit('feat: user facing change');

    const result = await dryRun(repo, remote);
    const notes = result === false ? '' : (result.nextRelease.notes ?? '');

    expect(notes).toContain('user facing change');
    expect(notes).not.toContain('test only change');
  });

  it('ignores a breaking commit that touches only documentation', async () => {
    const { repo, remote } = await setup();
    await repo.write('README.md', 'changed');
    // A footer, not `feat!`: the default angular preset does not read the `!` marker, so that form would release nothing with or without the filter.
    await repo.commit('feat: rewrite the docs\n\nBREAKING CHANGE: the docs are different');

    expect(await dryRun(repo, remote)).toBe(false);
  });

  it('passes the stock analyzer options through', async () => {
    const { repo, remote } = await setup();
    await repo.write('src/b.ts', 'b');
    await repo.commit('docs: describe b');

    const result = await dryRun(repo, remote, { releaseRules: [{ type: 'docs', release: 'patch' }] });

    expect(result === false ? undefined : result.nextRelease.version).toBe('1.0.1');
  });

  it('applies the userFacing overrides', async () => {
    const { repo, remote } = await setup();
    await repo.write('README.md', 'changed');
    await repo.commit('fix: reword the readme');

    const result = await dryRun(repo, remote, { userFacing: { include: ['README.md'] } });

    expect(result === false ? undefined : result.nextRelease.version).toBe('1.0.1');
  });
});
