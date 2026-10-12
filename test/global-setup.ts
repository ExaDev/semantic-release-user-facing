import { execFile } from 'node:child_process';
import { dirname } from 'node:path';

/**
 * Builds the package once before the suite: the end-to-end cases hand semantic-release the built entry points by absolute path, the way a consumer's config resolves them.
 */
export default async function setup(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('pnpm', ['exec', 'tsdown'], { cwd: dirname(import.meta.dirname) }, (error) => {
      if (error === null) {
        resolve();
      } else {
        reject(new Error(`tsdown build failed: ${error.message}`, { cause: error }));
      }
    });
  });
}
