import fs from 'fs';
import path from 'path';
import { isInside, isValidPublicAssetPath, realPath } from './utils/paths';
import type { CopiedFile } from './types';

/** Marks a config or front matter value that names a file in an npm package */
export const NPM_PREFIX = 'npm:';

/** The output directory for files that config values take from packages */
export const PACKAGE_ASSETS_DIR = '_packages';

// From validate-npm-package-name: lowercase, and no leading `.` or `_`
const PACKAGE_NAME_SEGMENT = /^[a-z0-9~-][a-z0-9._~-]*$/;
const PACKAGE_SCOPE_SEGMENT = /^@[a-z0-9~-][a-z0-9._~-]*$/;

/** A package and a file path inside it, which is empty for its entry point */
export interface NpmSpecifier {
  name: string;
  subpath: string;
}

/** Reads and resolves files, so tests can run without real files */
export interface PackageFileSystem {
  isFile(filePath: string): boolean;
  realPath(filePath: string): string;
}

export const nodePackageFileSystem: PackageFileSystem = {
  isFile: filePath =>
    fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false,
  realPath,
};

/** Why a value that names a package that is not installed can't be used */
export function getMissingPackageReason(name: string): string {
  return `needs package "${name}", which is not installed; run bun install`;
}

export function isNpmSpecifier(value: string): boolean {
  return value.startsWith(NPM_PREFIX);
}

/**
 * Parses `npm:<name>[/<subpath>]`. Returns null for a value without the
 * prefix or a malformed one.
 */
export function parseNpmSpecifier(value: string): NpmSpecifier | null {
  if (!isNpmSpecifier(value)) {
    return null;
  }
  const segments = value.slice(NPM_PREFIX.length).split('/');
  const nameLength = segments[0]?.startsWith('@') ? 2 : 1;
  const nameSegments = segments.slice(0, nameLength);
  if (
    nameSegments.length !== nameLength ||
    (nameLength === 2 && !PACKAGE_SCOPE_SEGMENT.test(nameSegments[0]!)) ||
    !PACKAGE_NAME_SEGMENT.test(nameSegments[nameLength - 1]!)
  ) {
    return null;
  }
  const rest = segments.slice(nameLength);
  const subpath = rest.join('/');
  if (rest.length > 0 && !isValidPublicAssetPath(subpath)) {
    return null;
  }
  return { name: nameSegments.join('/'), subpath };
}

/**
 * Whether a config value can name a file: a path in `public/`, or a file
 * in a package
 */
export function isValidConfigAssetPath(value: string): boolean {
  if (isNpmSpecifier(value)) {
    return Boolean(parseNpmSpecifier(value)?.subpath);
  }
  return isValidPublicAssetPath(value);
}

/**
 * The directory of an installed package, found the way Node finds one: in
 * `node_modules` in `fromDir` or the nearest ancestor that has it
 */
export function findPackageDir(
  name: string,
  fromDir: string,
  packageFs: PackageFileSystem = nodePackageFileSystem,
): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (packageFs.isFile(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export interface ConfigAssetOptions {
  publicDir: string;
  publicFiles: ReadonlySet<string>;
  projectDir: string;
  packageFs?: PackageFileSystem;
}

/**
 * The file a config value names, or why it can't be used, phrased to follow
 * the quoted value. Package files are found by path, ignoring the package's
 * `exports`, which often leave out files such as fonts. The value must be
 * valid (see isValidConfigAssetPath).
 */
export function resolveConfigAssetPath(
  value: string,
  options: ConfigAssetOptions,
): { filePath: string } | { reason: string } {
  const specifier = parseNpmSpecifier(value);
  if (!specifier) {
    const filePath = path.resolve(options.publicDir, ...value.split('/'));
    return options.publicFiles.has(filePath)
      ? { filePath }
      : { reason: 'does not exist in public/' };
  }
  const packageFs = options.packageFs ?? nodePackageFileSystem;
  const { name, subpath } = specifier;
  const packageDir = findPackageDir(name, options.projectDir, packageFs);
  if (!packageDir) {
    return { reason: getMissingPackageReason(name) };
  }
  const filePath = path.join(packageDir, ...subpath.split('/'));
  if (!packageFs.isFile(filePath)) {
    return { reason: `does not exist in package "${name}"` };
  }
  if (!isInside(packageFs.realPath(packageDir), packageFs.realPath(filePath))) {
    return { reason: `is outside package "${name}"` };
  }
  return { filePath };
}

/** Where a package file named by a config value is published */
export function getPackageAssetOutputPath(value: string): string {
  return `${PACKAGE_ASSETS_DIR}/${value.slice(NPM_PREFIX.length)}`;
}

/**
 * The package files that config values name, as copy references keyed by
 * output path. Values must already be validated.
 */
export function getPackageAssetOutputs(
  values: Iterable<string | undefined>,
  projectDir: string,
  packageFs: PackageFileSystem = nodePackageFileSystem,
): Map<string, CopiedFile> {
  const outputs = new Map<string, CopiedFile>();
  for (const value of values) {
    if (!value || !isNpmSpecifier(value)) {
      continue;
    }
    const resolved = resolveConfigAssetPath(value, {
      publicDir: projectDir,
      publicFiles: new Set(),
      projectDir,
      packageFs,
    });
    if ('reason' in resolved) {
      throw new Error(`"${value}" ${resolved.reason}`);
    }
    outputs.set(getPackageAssetOutputPath(value), {
      copyFrom: resolved.filePath,
    });
  }
  return outputs;
}
