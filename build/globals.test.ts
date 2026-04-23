import type { Globals } from './globals';

export function createGlobals(overrides: Partial<Globals> = {}): Globals {
  return {
    createSha256Hasher() {
      return {
        update() {},
        digest() {
          return '0'.repeat(64);
        },
      };
    },
    cwd() {
      return '/tmp/test-site';
    },
    getEnv() {
      return undefined;
    },
    now() {
      return 0;
    },
    pid() {
      return 1;
    },
    readFileArrayBuffer() {
      return Promise.resolve(new ArrayBuffer(0));
    },
    sleepSync() {},
    stderrWrite() {},
    stdoutWrite() {},
    toISOString() {
      return '1970-01-01T00:00:00.000Z';
    },
    ...overrides,
  };
}
