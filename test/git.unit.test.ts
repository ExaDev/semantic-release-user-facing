import { describe, expect, it } from 'vitest';
import { createLimiter, parseNameStatus } from '../src/git.js';

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

describe('parseNameStatus malformed input', () => {
  it('fails loudly on an empty status letter', () => {
    expect(() => parseNameStatus('\0src/a.ts\0')).toThrow(/Unexpected git name-status output/);
  });

  it('fails loudly on an empty path', () => {
    expect(() => parseNameStatus('M\0\0')).toThrow(/Unexpected git name-status output/);
  });
});

describe('createLimiter', () => {
  /** A task that records when it starts and stays pending until released. */
  function controllableTask(onStart: (name: string) => void, name: string): { run: () => Promise<string>; release: () => void } {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    return {
      async run() {
        onStart(name);
        await gate;

        return name;
      },
      release,
    };
  }

  it('runs up to the limit at once and holds the rest', async () => {
    const log: string[] = [];
    const limited = createLimiter(2);
    const [a, b, c] = ['a', 'b', 'c'].map((name) => controllableTask((started) => {
      log.push(`start ${started}`);
    }, name));
    const results = [a, b, c].map(async (task) => limited(async () => task?.run() ?? ''));
    await Promise.resolve();

    expect(log).toEqual(['start a', 'start b']);

    a?.release();
    await results[0];
    await Promise.resolve();

    expect(log).toEqual(['start a', 'start b', 'start c']);

    b?.release();
    c?.release();
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c']);
  });

  it('starts waiting tasks in arrival order', async () => {
    const log: string[] = [];
    const limited = createLimiter(1);
    const tasks = ['a', 'b', 'c'].map((name) => controllableTask((started) => {
      log.push(`start ${started}`);
    }, name));
    const results = tasks.map(async (task) => limited(task.run));

    for (const task of tasks) {
      task.release();
    }
    await Promise.all(results);

    expect(log).toEqual(['start a', 'start b', 'start c']);
  });

  it('frees the slot when a task rejects', async () => {
    const limited = createLimiter(1);

    await expect(limited(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await limited(async () => Promise.resolve('next'))).toBe('next');
  });

  it('lets later tasks run immediately once earlier ones finished', async () => {
    const log: string[] = [];
    const limited = createLimiter(1);
    await limited(async () => Promise.resolve(log.push('one')));
    await limited(async () => Promise.resolve(log.push('two')));

    expect(log).toEqual(['one', 'two']);
  });
});
