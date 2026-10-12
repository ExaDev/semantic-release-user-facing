import picomatch from 'picomatch';
import type { UserFacingRules } from './options.js';

/**
 * How a changed path counts towards a commit being user-facing. `manifest` is a `package.json` whose verdict depends on what changed inside it, decided by `manifestChangeIsUserFacing`.
 */
export type PathVerdict = 'user-facing' | 'non-user-facing' | 'manifest';

/**
 * Paths that never ship to a consumer: tests, documentation, repository and editor metadata, lockfiles, and the configuration of lint, format, commit, test and release tooling. Deliberately narrow, because a path not listed here counts as user-facing and a missed release costs more than an extra patch. Build configuration (`tsconfig`, bundler config) is absent on purpose, since it changes what ships.
 */
export const nonShippingGlobs: readonly string[] = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/test/**',
  '**/tests/**',
  '**/*.md',
  '**/docs/**',
  '.github/**',
  '.husky/**',
  '.vscode/**',
  '.changeset/**',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/bun.lock',
  '**/bun.lockb',
  '**/.editorconfig',
  '**/.gitignore',
  '**/.gitattributes',
  '**/.eslintrc*',
  '**/.prettierrc*',
  '**/{eslint,prettier,commitlint,lint-staged,stryker,vitest,jest,release}.config.*',
  '**/.releaserc*',
];

const manifestBasename = 'package.json';

/**
 * Compiles the verdict function for one rule set. Precedence: `include`, then `exclude`, then the built-in non-shipping defaults, then the `package.json` content check, and otherwise user-facing. The defaults sit before the manifest check so a fixture `package.json` under a test directory never counts as a new package.
 */
export function createPathClassifier(rules: UserFacingRules): (path: string) => PathVerdict {
  const options = { dot: true } as const;
  const included = picomatch(rules.include, options);
  const excluded = picomatch(rules.exclude, options);
  const nonShipping = picomatch([...nonShippingGlobs], options);

  return (path) => {
    if (included(path)) {
      return 'user-facing';
    }
    if (excluded(path)) {
      return 'non-user-facing';
    }
    if (nonShipping(path)) {
      return 'non-user-facing';
    }
    if (path === manifestBasename || path.endsWith(`/${manifestBasename}`)) {
      return 'manifest';
    }

    return 'user-facing';
  };
}
