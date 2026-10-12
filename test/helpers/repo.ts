import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Commit } from 'semantic-release';

/**
 * The environment a git child process gets: the parent's, minus every `GIT_*` variable. A hook or an outer repository sets `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`, and a fixture's git commands would otherwise act on that repository.
 */
export function cleanGitEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) {
      env[key] = value;
    }
  }

  return env;
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
  const env = cleanGitEnvironment();
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
    },
    async dispose() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}
