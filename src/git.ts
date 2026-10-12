import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { z } from 'zod';
import type { Manifest } from './manifest.js';

export type ChangeStatus = 'added' | 'modified' | 'deleted';

export interface FileChange {
  readonly path: string;
  readonly status: ChangeStatus;
}

/**
 * Read access to the repository, injected so classification stays testable without git.
 */
export interface RepositoryReader {
  /**
   * The files a commit changed relative to its first parent (every file for a root commit, none for an empty commit). A rename is reported as the deletion of the old path and the addition of the new one, so moving a file out of a user-facing directory is not hidden.
   */
  changedFiles: (hash: string) => Promise<readonly FileChange[]>;
  /**
   * The parsed `package.json` at `path` in the commit (`which: 'after'`) or in its first parent (`which: 'before'`).
   */
  manifest: (hash: string, path: string, which: 'before' | 'after') => Promise<Manifest>;
}

export interface GitOptions {
  readonly cwd: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const manifestSchema = z.record(z.string(), z.unknown());

const statusByLetter: Readonly<Record<string, ChangeStatus>> = {
  A: 'added',
  D: 'deleted',
};

/**
 * Splits `git show --name-status -z` output (`STATUS NUL PATH NUL ...`) into changes. With `--no-renames` every status is a single letter, so the stream is strictly pairs.
 */
export function parseNameStatus(output: string): readonly FileChange[] {
  const fields = output.split('\0');
  const changes: FileChange[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const letter = fields[index];
    const path = fields[index + 1];
    if (letter === undefined || path === undefined || letter === '' || path === '') {
      throw new Error(`Unexpected git name-status output near field ${String(index)}`);
    }
    changes.push({ path, status: statusByLetter[letter] ?? 'modified' });
  }

  return changes;
}

/**
 * Runs tasks with at most `max` in flight, so classifying a long history never starts more git processes than the machine has cores.
 */
function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < max) {
      active += 1;
    } else {
      // A finishing task hands its slot straight to the next waiter, so `active` never exceeds `max`.
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next === undefined) {
        active -= 1;
      } else {
        next();
      }
    }
  };
}

/**
 * A `RepositoryReader` backed by the `git` executable on `PATH`, run in the release's working directory with the release's environment.
 */
export function createGitReader({ cwd, env }: GitOptions): RepositoryReader {
  const limited = createLimiter(availableParallelism());
  const git = async (args: readonly string[]): Promise<string> =>
    limited(
      async () =>
        new Promise<string>((resolve, reject) => {
          execFile('git', [...args], { cwd, env: { ...env }, encoding: 'utf8', maxBuffer: Infinity }, (error, stdout) => {
            if (error === null) {
              resolve(stdout);
            } else {
              reject(new Error(`git ${args.join(' ')} failed: ${error.message}`, { cause: error }));
            }
          });
        }),
    );

  return {
    async changedFiles(hash) {
      const output = await git(['show', '--first-parent', '--no-renames', '--name-status', '-z', '--format=', hash]);

      return parseNameStatus(output);
    },
    async manifest(hash, path, which) {
      const revision = which === 'after' ? hash : `${hash}^1`;
      const text = await git(['show', `${revision}:${path}`]);

      return manifestSchema.parse(JSON.parse(text));
    },
  };
}
