# semantic-release-user-facing

[semantic-release](https://github.com/semantic-release/semantic-release) plugins that decide what a release contains from what a commit changed, not only from its message. A `feat:` that touches nothing but tests, CI or documentation no longer cuts a release or appears in the changelog.

The package has two entry points, each a drop-in superset of a stock plugin:

| Entry point | Replaces | Lifecycle step |
| --- | --- | --- |
| `semantic-release-user-facing` | `@semantic-release/commit-analyzer` | `analyzeCommits` |
| `semantic-release-user-facing/notes` | `@semantic-release/release-notes-generator` | `generateNotes` |

Each takes the stock plugin's own options unchanged, plus one key, `userFacing`. Changing plugin name is the whole migration.

## Getting started

```sh
pnpm add -D semantic-release-user-facing
```

`semantic-release` is a peer dependency. Replace the two stock plugins in the release configuration:

```ts
// release.config.ts
import type { Options } from 'semantic-release';

const config: Options = {
  branches: ['main'],
  plugins: [
    ['semantic-release-user-facing', { preset: 'conventionalcommits' }],
    ['semantic-release-user-facing/notes', { preset: 'angular' }],
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github',
  ],
};

export default config;
```

`@semantic-release/changelog` and `@semantic-release/github` read the notes the second entry point produces, so the changelog and the GitHub release body follow it. The two entry points are configured independently: a documentation commit can stay out of the release trigger yet appear in the notes by giving only the notes entry an `include` for it.

## What counts as user-facing

A commit is kept when it changes at least one user-facing file, and dropped otherwise, whatever its type (a `feat!` that only touches documentation is dropped). Each changed path gets a verdict in this order, and the first rule that matches wins:

1. It matches `userFacing.include`: user-facing.
2. It matches `userFacing.exclude`: not user-facing.
3. It matches the built-in non-shipping defaults: not user-facing.
4. It is a `package.json`: decided by its content, below.
5. Anything else: user-facing.

The defaults are exported as `nonShippingGlobs` in `src/classify.ts`. They cover tests, Markdown and documentation, repository and editor metadata, lockfiles and the configuration of lint, format, commit, test and release tooling. They are deliberately narrow: an unlisted path counts as user-facing, because a missed release costs more than an extra patch. Build configuration such as `tsconfig.json` is not in the list, since it changes what ships.

### `package.json` is read by content

Whether a manifest edit is user-facing depends on what changed inside it, not on its path. Changes to the runtime dependency fields, to `bin`, `exports`, `imports`, `main`, `module`, `types`, `files`, `engines`, `type`, `sideEffects`, `os` or `cpu` are user-facing. Changes to `devDependencies`, `scripts`, `version` and similar are not. The full field list is `consumerFacingManifestFields` in `src/manifest.ts`. A manifest that is added or deleted is user-facing, unless its path is excluded (a fixture manifest under `test/` never counts).

### Other cases

- A commit that changes no files at all is kept: an empty commit is how a release is forced on purpose.
- A merge commit is judged by what it brings in relative to its first parent.
- A rename counts as a deletion of the old path and an addition of the new one, so moving a file out of the source tree is not hidden.

## Options

```ts
['semantic-release-user-facing', {
  preset: 'conventionalcommits', // any @semantic-release/commit-analyzer option
  userFacing: {
    include: ['README.md'],          // picomatch globs, matched against repository-relative paths
    exclude: ['src/generated/**'],
  },
}]
```

Both lists default to empty. Globs are [picomatch](https://github.com/micromatch/picomatch) patterns with dotfiles included. An unknown key under `userFacing` is an error.

## Monorepos

Run semantic-release per package from the package directory, or with a monorepo wrapper that scopes commits to a package path. This plugin then judges each commit within that scope. It does not itself split a history by package.

## Development

```sh
pnpm install
pnpm run lint:check
pnpm run typecheck
pnpm run test
pnpm run build
```

`pnpm run test` builds the package first, because the end-to-end cases run a real semantic-release dry run against a throwaway repository with the built entry points loaded by path.
