import { describe, expect, it } from 'vitest';
import { filterUserFacingCommits } from '../src/filter-commits.js';
import type { FileChange, RepositoryReader } from '../src/git.js';
import type { Manifest } from '../src/manifest.js';
import { commitFixture } from './helpers/repo.js';

const commit = commitFixture('abc1234');
const noRules = { include: [], exclude: [] };

/** A reader that serves one commit's changes and records every manifest read it is asked for. */
function recordingReader(changes: readonly FileChange[], manifests: Readonly<Record<string, Manifest>>) {
  const reads: string[] = [];
  const reader: RepositoryReader = {
    async changedFiles() {
      return Promise.resolve(changes);
    },
    async manifest(_hash, path, which) {
      const key = `${which}:${path}`;
      reads.push(key);
      const manifest = manifests[key];
      if (manifest === undefined) {
        // The real reader fails the same way: `git show` rejects for a path absent at that revision.
        return Promise.reject(new Error(`no ${key}`));
      }

      return Promise.resolve(manifest);
    },
  };

  return { reader, reads };
}

describe('filterUserFacingCommits manifest reads', () => {
  it('reads only the side of a manifest that exists', async () => {
    const added = recordingReader([{ path: 'package.json', status: 'added' }], { 'after:package.json': { name: 'p' } });
    const deleted = recordingReader([{ path: 'package.json', status: 'deleted' }], { 'before:package.json': { name: 'p' } });

    expect(await filterUserFacingCommits([commit], noRules, added.reader)).toEqual([commit]);
    expect(await filterUserFacingCommits([commit], noRules, deleted.reader)).toEqual([commit]);
    expect(added.reads).toEqual(['after:package.json']);
    expect(deleted.reads).toEqual(['before:package.json']);
  });

  it('reads both sides of a modified manifest', async () => {
    const { reader, reads } = recordingReader([{ path: 'package.json', status: 'modified' }], {
      'before:package.json': { name: 'p', scripts: { a: '1' } },
      'after:package.json': { name: 'p', scripts: { a: '2' } },
    });

    expect(await filterUserFacingCommits([commit], noRules, reader)).toEqual([]);
    expect([...reads].sort()).toEqual(['after:package.json', 'before:package.json']);
  });

  it('does not read a manifest a path rule already settled', async () => {
    const { reader, reads } = recordingReader([{ path: 'test/fixtures/package.json', status: 'modified' }], {});

    expect(await filterUserFacingCommits([commit], noRules, reader)).toEqual([]);
    expect(reads).toEqual([]);
  });
});
