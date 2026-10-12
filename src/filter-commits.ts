import type { Commit } from 'semantic-release';
import { createPathClassifier } from './classify.js';
import type { FileChange, RepositoryReader } from './git.js';
import { manifestChangeIsUserFacing } from './manifest.js';
import type { UserFacingRules } from './options.js';

type PathClassifier = ReturnType<typeof createPathClassifier>;

/**
 * Whether one changed file is user-facing, resolving a `package.json` by what changed inside it.
 */
async function changeIsUserFacing(
  change: FileChange,
  hash: string,
  verdictOf: PathClassifier,
  reader: Readonly<RepositoryReader>,
): Promise<boolean> {
  const verdict = verdictOf(change.path);
  if (verdict !== 'manifest') {
    return verdict === 'user-facing';
  }
  const [before, after] = await Promise.all([
    change.status === 'added' ? undefined : reader.manifest(hash, change.path, 'before'),
    change.status === 'deleted' ? undefined : reader.manifest(hash, change.path, 'after'),
  ]);

  return manifestChangeIsUserFacing(before, after);
}

/**
 * A commit is user-facing when any file it changes is. A commit that changes no files at all counts as user-facing: an empty commit is how a release is forced on purpose.
 */
async function commitIsUserFacing(
  commit: Commit,
  verdictOf: PathClassifier,
  reader: Readonly<RepositoryReader>,
): Promise<boolean> {
  const changes = await reader.changedFiles(commit.hash);
  if (changes.length === 0) {
    return true;
  }
  const verdicts = await Promise.all(changes.map(async (change) => changeIsUserFacing(change, commit.hash, verdictOf, reader)));

  return verdicts.some(Boolean);
}

/**
 * Keeps the commits that change at least one user-facing file, in their original order.
 * @param commits - The commits semantic-release is about to analyse or summarise.
 * @param rules - Overrides for the built-in user-facing definition.
 * @param reader - Repository access; it bounds how many git processes run at once.
 */
export async function filterUserFacingCommits(
  commits: readonly Commit[],
  rules: UserFacingRules,
  reader: Readonly<RepositoryReader>,
): Promise<readonly Commit[]> {
  const verdictOf = createPathClassifier(rules);
  const decided = await Promise.all(
    commits.map(async (commit) => ({ commit, keep: await commitIsUserFacing(commit, verdictOf, reader) })),
  );

  return decided.filter(({ keep }) => keep).map(({ commit }) => commit);
}
