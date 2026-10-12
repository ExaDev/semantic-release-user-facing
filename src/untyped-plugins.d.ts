// The two stock plugins this package wraps ship no type declarations. Only the lifecycle step each wrapper delegates to is declared, matching the JSDoc on the plugin's own export.

declare module '@semantic-release/commit-analyzer' {
  import type { AnalyzeCommitsContext, ReleaseType } from 'semantic-release';

  // Narrowed to what the analyzer reads from the context (`commits`, `cwd` and `logger.log`), so a caller needs no more than that.
  export function analyzeCommits(
    pluginConfig: Readonly<Record<string, unknown>>,
    context: Pick<AnalyzeCommitsContext, 'commits' | 'cwd'> & { readonly logger: Pick<AnalyzeCommitsContext['logger'], 'log'> },
  ): Promise<ReleaseType | null>;
}

declare module '@semantic-release/release-notes-generator' {
  import type { GenerateNotesContext } from 'semantic-release';

  export function generateNotes(
    pluginConfig: Readonly<Record<string, unknown>>,
    context: GenerateNotesContext,
  ): Promise<string>;
}
