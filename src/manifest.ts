import { isDeepStrictEqual } from 'node:util';

/**
 * The `package.json` fields that change what a consumer installs or how the package resolves and loads. Everything else (`devDependencies`, `scripts`, `version`, repository metadata) is invisible to a consumer.
 */
export const consumerFacingManifestFields: readonly string[] = [
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
  'bin',
  'exports',
  'imports',
  'main',
  'module',
  'types',
  'typings',
  'browser',
  'files',
  'engines',
  'type',
  'sideEffects',
  'os',
  'cpu',
];

export type Manifest = Readonly<Record<string, unknown>>;

/**
 * Whether a `package.json` edit changes something a consumer can observe.
 * @param before - The manifest at the commit's first parent, or `undefined` when the commit adds it.
 * @param after - The manifest at the commit, or `undefined` when the commit deletes it.
 * @returns `true` for an added or deleted manifest, or when any consumer-facing field differs.
 */
export function manifestChangeIsUserFacing(before: Manifest | undefined, after: Manifest | undefined): boolean {
  if (before === undefined || after === undefined) {
    return true;
  }

  return consumerFacingManifestFields.some((field) => !isDeepStrictEqual(before[field], after[field]));
}
