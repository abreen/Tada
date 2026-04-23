type FsModule = typeof import('fs');
type FsModuleOverrides = object & { promises?: FsModule['promises'] };

type FsModuleMock<T extends FsModuleOverrides> = T & {
  default: Omit<T, 'promises'> & Pick<FsModule, 'promises'>;
  promises: FsModule['promises'];
};

export function createFsModuleMock<T extends FsModuleOverrides>(
  overrides: T,
): FsModuleMock<T> {
  const promises = overrides.promises ?? ({} as FsModule['promises']);

  return { ...overrides, default: { ...overrides, promises }, promises };
}
