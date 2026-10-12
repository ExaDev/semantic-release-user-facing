import type { Options } from 'semantic-release';

type ReleaseLevel = 'major' | 'minor' | 'patch' | false;

interface CommitType {
  readonly type: string;
  readonly release: ReleaseLevel;
}

/**
 * Single source of truth for the conventional-commit types this project uses. commitlint's allowed type-enum (commitlint.config.ts imports this) and commit-analyzer's releaseRules below both derive from it, so a type cannot trigger a release without also being accepted by commit-msg validation, or the reverse.
 */
export const commitTypes: readonly CommitType[] = [
  { type: 'feat', release: 'minor' },
  { type: 'fix', release: 'patch' },
  { type: 'perf', release: 'patch' },
  { type: 'revert', release: 'patch' },
  { type: 'refactor', release: 'patch' },
  { type: 'docs', release: 'patch' },
  { type: 'style', release: 'patch' },
  { type: 'test', release: 'patch' },
  { type: 'build', release: 'patch' },
  { type: 'ci', release: 'patch' },
  { type: 'chore', release: 'patch' },
];

/**
 * Repository files that are not part of the published package and that the built-in non-shipping defaults do not cover: pnpm's settings and the patch files it applies to dev tooling.
 */
const userFacing = { include: [], exclude: ['patches/**', 'pnpm-workspace.yaml'] };

/**
 * Runs on `main`. Analyses commits since the last tag, bumps the version, publishes to npmjs.org through trusted OIDC publishing (no stored token, see .github/workflows/ci.yml), creates a versioned tag and GitHub Release with generated notes, and commits CHANGELOG.md and package.json back to main.
 */
const config: Options = {
  branches: ['main'],
  // Deliberately the SSH form, not package.json's own git+https:// repository field (that field stays https://; it is public consumer-facing metadata, unrelated to how this release pushes). semantic-release first tries to push to the repositoryUrl as given, and only if that fails rewrites it to https with the GITHUB_TOKEN embedded; the default GITHUB_TOKEN cannot bypass main's branch ruleset, so that fallback push would be rejected. The push as given authenticates with the deploy key the Release job provisions through GIT_SSH_COMMAND for the Release step alone (see .github/workflows/ci.yml), which the ruleset lists as a DeployKey bypass actor.
  repositoryUrl: 'git@github.com:ExaDev/semantic-release-user-facing.git',
  plugins: [
    [
      // This package's own entry points, loaded from the build the Release job produces, so a commit that changes nothing a consumer can observe (tests, tooling, documentation) never triggers a release of this package.
      './dist/index.js',
      {
        preset: 'conventionalcommits',
        releaseRules: [{ breaking: true, release: 'major' }, ...commitTypes.map((t) => ({ type: t.type, release: t.release }))],
        userFacing,
      },
    ],
    [
      './dist/notes.js',
      {
        // Deliberately angular, not conventionalcommits: conventional-changelog-writer's bundled commit partial does not match the conventionalcommits preset's function-based partial signature, producing a changelog with a version header and nothing under it.
        preset: 'angular',
        userFacing,
      },
    ],
    '@semantic-release/changelog',
    ['@semantic-release/npm', { npmPublish: true }],
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
  ],
};

export default config;
