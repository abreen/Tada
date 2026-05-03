import { beforeEach, mock } from 'bun:test';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import type { PathLike, PathOrFileDescriptor } from 'fs';
import type { FileHandle } from 'fs/promises';

const DEFAULT_BUNDLE_GLOBALS = {
  __IS_DEV__: false,
  __SITE_BASE_PATH__: '/',
  __SITE_TITLE_POSTFIX__: '',
  __SITE_DEFAULT_TIMEZONE__: 'UTC',
  __SITE_TIMEZONES__: [] as TimeZone[],
};

Object.assign(globalThis, DEFAULT_BUNDLE_GLOBALS);
beforeEach(() => {
  Object.assign(globalThis, DEFAULT_BUNDLE_GLOBALS);
});

const FORBIDDEN_FS_METHODS = [
  'copyFileSync',
  'existsSync',
  'mkdirSync',
  'mkdtempSync',
  'readdirSync',
  'renameSync',
  'rmSync',
  'rmdirSync',
  'statSync',
  'writeFileSync',
] as const;

const FORBIDDEN_FS_PROMISE_METHODS = [
  'access',
  'copyFile',
  'mkdir',
  'mkdtemp',
  'readdir',
  'rename',
  'rm',
  'stat',
  'writeFile',
] as const;

const packageDir = import.meta.dir;
const templatesDir = path.join(packageDir, 'templates');
const realReadFileSync = fs.readFileSync.bind(fs);
const realReadFile = fsPromises.readFile.bind(fsPromises);
let checkingReadCaller = false;

function isPathInside(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function isCalledFromTemplateTest(): boolean {
  checkingReadCaller = true;
  try {
    const stack = new Error().stack?.replaceAll('\\', '/') ?? '';
    return stack
      .split('\n')
      .some(line => /\/templates\/[^/]+\.test\.ts/.test(line));
  } finally {
    checkingReadCaller = false;
  }
}

function assertAllowedTemplateRead(
  moduleId: string,
  member: string,
  filePath: unknown,
) {
  if (typeof filePath === 'number') {
    throw new Error(
      `Forbidden in unit tests: ${moduleId}.${member} file descriptors. Mock it with mock.module(...) or move filesystem coverage to functional_tests/.`,
    );
  }

  if (checkingReadCaller) {
    return;
  }

  const resolvedPath = path.resolve(String(filePath));
  if (
    !isCalledFromTemplateTest() ||
    path.extname(resolvedPath) !== '.html' ||
    !isPathInside(resolvedPath, templatesDir)
  ) {
    throw new Error(
      `Forbidden in unit tests: ${moduleId}.${member}. Only Lodash template tests under templates/ may read real .html template files.`,
    );
  }
}

const templateReadMethods = {
  readFileSync(
    filePath: PathOrFileDescriptor,
    options?: Parameters<typeof fs.readFileSync>[1],
  ) {
    assertAllowedTemplateRead('fs', 'readFileSync', filePath);
    return realReadFileSync(filePath, options);
  },
};

const templatePromiseReadMethods = {
  readFile(
    filePath: FileHandle | PathLike,
    options?: Parameters<typeof fsPromises.readFile>[1],
  ) {
    assertAllowedTemplateRead('fs.promises', 'readFile', filePath);
    return realReadFile(filePath, options);
  },
};

function createForbiddenMember(moduleId: string, member: string): () => never {
  const fail = (member: string): never => {
    throw new Error(
      `Forbidden in unit tests: ${moduleId}.${member}. Mock it with mock.module(...) or move filesystem coverage to functional_tests/.`,
    );
  };

  return () => fail(member);
}

function createForbiddenObject(
  moduleId: string,
  members: readonly string[],
  extraEntries: Record<string, unknown> = {},
): object {
  const target: Record<string, unknown> = { ...extraEntries };
  for (const member of members) {
    target[member] = createForbiddenMember(moduleId, member);
  }

  return new Proxy(target, {
    get(_target, property) {
      if (property === Symbol.toStringTag) {
        return 'UnitTestFsGuard';
      }
      if (property === 'then') {
        return undefined;
      }
      if (typeof property === 'string' && property in target) {
        return target[property];
      }
      throw new Error(
        `Forbidden in unit tests: ${moduleId}.${String(property)}. Mock it with mock.module(...) or move filesystem coverage to functional_tests/.`,
      );
    },
  });
}

const forbiddenPromises = createForbiddenObject(
  'fs.promises',
  FORBIDDEN_FS_PROMISE_METHODS,
  templatePromiseReadMethods,
);

const forbiddenFs = createForbiddenObject('fs', FORBIDDEN_FS_METHODS, {
  promises: forbiddenPromises,
  ...templateReadMethods,
});

for (const moduleId of ['fs']) {
  mock.module(moduleId, () => ({
    default: forbiddenFs,
    promises: forbiddenPromises,
    ...templateReadMethods,
    ...Object.fromEntries(
      FORBIDDEN_FS_METHODS.map(member => [
        member,
        createForbiddenMember(moduleId, member),
      ]),
    ),
  }));
}

for (const moduleId of ['fs/promises']) {
  mock.module(moduleId, () => ({
    default: forbiddenPromises,
    ...templatePromiseReadMethods,
    ...Object.fromEntries(
      FORBIDDEN_FS_PROMISE_METHODS.map(member => [
        member,
        createForbiddenMember(moduleId, member),
      ]),
    ),
  }));
}
