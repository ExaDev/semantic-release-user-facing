import { analyzeCommits as analyzeStockCommits } from '@semantic-release/commit-analyzer';
import type { AnalyzeCommitsContext, ReleaseType } from 'semantic-release';
import { filterUserFacingCommits } from './filter-commits.js';
import { createGitReader } from './git.js';
import { readPluginConfig } from './options.js';

/**
 * Drop-in superset of `@semantic-release/commit-analyzer`: the stock analyzer's own options are accepted unchanged, plus `userFacing: { include, exclude }`. Commits that change nothing user-facing are removed before the stock analyzer sees them, so they cannot trigger a release whatever their type.
 * @param pluginConfig - The stock analyzer's options plus the optional `userFacing` overrides.
 * @param context - The semantic-release analyze-commits context.
 * @returns The stock analyzer's release type for the remaining commits, or `null` when none triggers a release.
 */
export async function analyzeCommits(pluginConfig: unknown, context: AnalyzeCommitsContext): Promise<ReleaseType | null> {
  const { rules, delegated } = readPluginConfig(pluginConfig);
  const reader = createGitReader({ cwd: context.cwd, env: context.env });
  const commits = await filterUserFacingCommits(context.commits, rules, reader);
  context.logger.log(
    'Analysing %d of %d commits that change something user-facing',
    commits.length,
    context.commits.length,
  );

  return analyzeStockCommits(delegated, { ...context, commits });
}
