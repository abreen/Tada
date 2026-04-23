import { mock } from 'bun:test';

const FS_METHODS = [
  'copyFileSync',
  'existsSync',
  'mkdirSync',
  'mkdtempSync',
  'readFileSync',
  'readdirSync',
  'renameSync',
  'rmSync',
  'rmdirSync',
  'statSync',
  'writeFileSync',
] as const;

const FS_PROMISE_METHODS = [
  'access',
  'copyFile',
  'mkdir',
  'mkdtemp',
  'readFile',
  'readdir',
  'rename',
  'rm',
  'stat',
  'writeFile',
] as const;

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
  FS_PROMISE_METHODS,
);

const forbiddenFs = createForbiddenObject('fs', FS_METHODS, {
  promises: forbiddenPromises,
});

for (const moduleId of ['fs']) {
  mock.module(moduleId, () => ({
    default: forbiddenFs,
    promises: forbiddenPromises,
    ...Object.fromEntries(
      FS_METHODS.map(member => [
        member,
        createForbiddenMember(moduleId, member),
      ]),
    ),
  }));
}

for (const moduleId of ['fs/promises']) {
  mock.module(moduleId, () => ({
    default: forbiddenPromises,
    ...Object.fromEntries(
      FS_PROMISE_METHODS.map(member => [
        member,
        createForbiddenMember(moduleId, member),
      ]),
    ),
  }));
}
