import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitReader } from '../src/git.js';
import { createTestRepo, type TestRepo } from './helpers/repo.js';

describe('createGitReader over a real repository', () => {
  const repos: TestRepo[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all([
      ...repos.splice(0).map(async (repo) => repo.dispose()),
      ...directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })),
    ]);
  });

  it('reads the files a commit changed and the manifest on both sides', async () => {
    const repo = await createTestRepo();
    repos.push(repo);
    await repo.write('package.json', JSON.stringify({ name: 'p', version: '1.0.0' }));
    await repo.commit('chore: baseline');
    await repo.write('package.json', JSON.stringify({ name: 'p', version: '2.0.0' }));
    await repo.write('src/a.ts', 'a');
    const hash = await repo.commit('feat: change');
    const reader = createGitReader({ cwd: repo.directory, env: repo.env });

    expect(await reader.changedFiles(hash)).toEqual([
      { path: 'package.json', status: 'modified' },
      { path: 'src/a.ts', status: 'added' },
    ]);
    expect(await reader.manifest(hash, 'package.json', 'before')).toEqual({ name: 'p', version: '1.0.0' });
    expect(await reader.manifest(hash, 'package.json', 'after')).toEqual({ name: 'p', version: '2.0.0' });
  });

  it('runs git with the environment it was given', async () => {
    const repo = await createTestRepo();
    repos.push(repo);
    await repo.write('src/a.ts', 'a');
    const hash = await repo.commit('feat: a');
    const elsewhere = await mkdtemp(join(tmpdir(), 'user-facing-env-'));
    directories.push(elsewhere);
    // The working directory is not a repository: only the injected GIT_DIR can locate one.
    const reader = createGitReader({ cwd: elsewhere, env: { ...repo.env, GIT_DIR: join(repo.directory, '.git') } });

    expect(await reader.changedFiles(hash)).toEqual([{ path: 'src/a.ts', status: 'added' }]);
  });

  it('rejects with the git command and keeps the cause when git fails', async () => {
    const repo = await createTestRepo();
    repos.push(repo);
    const reader = createGitReader({ cwd: repo.directory, env: repo.env });

    const failure: unknown = await reader.changedFiles('0000000000000000000000000000000000000000').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) {
      return;
    }
    expect(failure.message).toMatch(/^git show --first-parent --no-renames --name-status -z --format= 0{40} failed: /);
    expect(failure.cause).toBeInstanceOf(Error);
  });
});
