type Sha256Hasher = {
  update: (buffer: ArrayBuffer) => void;
  digest: (encoding: 'hex') => string;
};

export interface Globals {
  createSha256Hasher: () => Sha256Hasher;
  cwd: () => string;
  getEnv: (name: string) => string | undefined;
  now: () => number;
  pid: () => number;
  readFileArrayBuffer: (filePath: string) => Promise<ArrayBuffer>;
  sleepSync: (delayMs: number) => void;
  stderrWrite: (chunk: string) => void;
  stdoutWrite: (chunk: string) => void;
  toISOString: (timestampMs: number) => string;
}

export const globals: Globals = {
  createSha256Hasher() {
    return new Bun.CryptoHasher('sha256');
  },
  cwd() {
    return process.cwd();
  },
  getEnv(name) {
    return process.env[name];
  },
  now() {
    return Date.now();
  },
  pid() {
    return process.pid;
  },
  readFileArrayBuffer(filePath) {
    return Bun.file(filePath).arrayBuffer();
  },
  sleepSync(delayMs) {
    Bun.sleepSync(delayMs);
  },
  stderrWrite(chunk) {
    process.stderr.write(chunk);
  },
  stdoutWrite(chunk) {
    process.stdout.write(chunk);
  },
  toISOString(timestampMs) {
    return new Date(timestampMs).toISOString();
  },
};
