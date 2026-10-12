import { describe, expect, it } from 'vitest';
import { parseNameStatus } from '../src/git.js';

describe('parseNameStatus', () => {
  it('returns nothing for an empty commit', () => {
    expect(parseNameStatus('')).toEqual([]);
  });

  it('pairs each status letter with its NUL-terminated path', () => {
    expect(parseNameStatus('A\0src/a.ts\0M\0src/b.ts\0D\0old.ts\0')).toEqual([
      { path: 'src/a.ts', status: 'added' },
      { path: 'src/b.ts', status: 'modified' },
      { path: 'old.ts', status: 'deleted' },
    ]);
  });

  it('keeps spaces and non-ASCII characters in a path', () => {
    expect(parseNameStatus('A\0test/ü a.test.ts\0')).toEqual([{ path: 'test/ü a.test.ts', status: 'added' }]);
  });

  it('treats a type change as a modification', () => {
    expect(parseNameStatus('T\0link\0')).toEqual([{ path: 'link', status: 'modified' }]);
  });

  it('fails loudly on a status without a path', () => {
    expect(() => parseNameStatus('M\0')).toThrow(/Unexpected git name-status output/);
  });
});
