import { generateNotes as generateStockNotes } from '@semantic-release/release-notes-generator';
import type { GenerateNotesContext } from 'semantic-release';
import { filterUserFacingCommits } from './filter-commits.js';
import { createGitReader } from './git.js';
import { readPluginConfig } from './options.js';

/**
 * Drop-in superset of `@semantic-release/release-notes-generator`: the stock generator's own options are accepted unchanged, plus `userFacing: { include, exclude }`. Commits that change nothing user-facing are left out of the notes, and so out of the changelog and GitHub release body that consume them.
 * @param pluginConfig - The stock generator's options plus the optional `userFacing` overrides.
 * @param context - The semantic-release generate-notes context.
 * @returns The stock generator's notes for the remaining commits.
 */
export async function generateNotes(pluginConfig: unknown, context: GenerateNotesContext): Promise<string> {
  const { rules, delegated } = readPluginConfig(pluginConfig);
  const reader = createGitReader({ cwd: context.cwd, env: context.env });
  const commits = await filterUserFacingCommits(context.commits, rules, reader);

  return generateStockNotes(delegated, { ...context, commits });
}
