import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeCommits } from '../src/analyze-commits.js';
import { createTestRepo, type TestRepo } from './helpers/repo.js';

describe('analyzeCommits', () => {
  const repos: TestRepo[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map(async (repo) => repo.dispose()));
  });

  it('logs how many commits it analyses and delegates only those to the stock analyzer', async () => {
    const repo = await createTestRepo();
    repos.push(repo);
    await repo.write('src/a.ts', 'a');
    await repo.commit('chore: baseline');
    await repo.write('test/a.test.ts', 'a');
    const testOnly = await repo.commit('feat: tests only');
    await repo.write('src/a.ts', 'b');
    const source = await repo.commit('fix: source');
    const commits = await Promise.all([testOnly, source].map(async (hash) => repo.asCommit(hash)));
    const log = vi.fn<(...args: readonly unknown[]) => void>();

    const result = await analyzeCommits({}, { cwd: repo.directory, env: repo.env, commits, logger: { log } });

    expect(log).toHaveBeenCalledWith('Analysing %d of %d commits that change something user-facing', 1, 2);
    expect(result).toBe('patch');
  });
});
