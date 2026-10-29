import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Commit } from 'semantic-release';

/**
 * The variables a fixture's git and semantic-release processes keep from the parent: where to find programs, the home directory and the locale. Nothing else is inherited, so no outer repository (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` from a hook) and no CI service (a pull request run's `GITHUB_REF` and `GITHUB_ACTIONS`, which make semantic-release believe the fixture is on the branch `refs/pull/N/merge` and refuse to release) leaks into a fixture.
 */
const inheritedVariables: readonly string[] = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE'];

export function fixtureEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of inheritedVariables) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

/**
 * A commit in the shape semantic-release hands to a plugin, with the fields a test does not care about left empty.
 */
export function commitFixture(hash: string, { short = hash, message = 'chore: fixture' }: { short?: string; message?: string } = {}): Commit {
  return {
    commit: { long: hash, short },
    tree: { long: '', short: '' },
    author: { name: 'Test', email: 'test@example.com', short: '' },
    committer: { name: 'Test', email: 'test@example.com', short: '' },
    subject: message.split('\n')[0] ?? '',
    body: '',
    message,
    hash,
    committerDate: '',
  };
}

export interface TestRepo {
  readonly directory: string;
  readonly env: Record<string, string>;
  git: (...args: readonly string[]) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  /** Stages every change and commits it, allowing an empty commit; returns the new commit's hash. */
  commit: (message: string) => Promise<string>;
  /** The commit as semantic-release hands it to a plugin. */
  asCommit: (hash: string) => Promise<Commit>;
  dispose: () => Promise<void>;
}

/**
 * Creates a throwaway repository on `main` with signing and hooks disabled locally, so the machine's global git configuration cannot change what a test observes.
 */
export async function createTestRepo(): Promise<TestRepo> {
  const directory = await mkdtemp(join(tmpdir(), 'user-facing-'));
  const env = fixtureEnvironment();
  const git = async (...args: readonly string[]): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      execFile('git', args, { cwd: directory, env, encoding: 'utf8' }, (error, stdout) => {
        if (error === null) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`git ${args.join(' ')} failed: ${error.message}`, { cause: error }));
        }
      });
    });

  await git('init', '--quiet', '--initial-branch=main');
  await git('config', 'user.name', 'Test');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'tag.gpgsign', 'false');
  await git('config', 'core.hooksPath', '/dev/null');

  return {
    directory,
    env,
    git,
    async write(path, content) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    },
    async commit(message) {
      await git('add', '--all');
      await git('commit', '--quiet', '--allow-empty', '--message', message);

      return git('rev-parse', 'HEAD');
    },
    async asCommit(hash) {
      const message = await git('log', '-1', '--format=%B', hash);
      const short = await git('rev-parse', '--short', hash);

      return commitFixture(hash, { short, message });
    },
    async dispose() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}
