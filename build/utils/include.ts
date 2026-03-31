import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { isPartial } from './file-types';
import { stripHtmlComments } from './render';

const MAX_INCLUDE_DEPTH = 10;

export function createIncludeFunction(
  callerFilePath: string,
  templateParams: Record<string, unknown>,
  depth: number = 0,
): (relativePath: string) => string {
  return (relativePath: string): string => {
    const callerDir = path.dirname(callerFilePath);
    const resolved = path.resolve(callerDir, relativePath);

    if (!fs.existsSync(resolved)) {
      throw new Error(
        `${callerFilePath}: partial not found: ${relativePath} (resolved to ${resolved})`,
      );
    }
    if (!isPartial(resolved)) {
      throw new Error(
        `${callerFilePath}: include target must start with "_": ${relativePath}`,
      );
    }
    if (depth >= MAX_INCLUDE_DEPTH) {
      throw new Error(
        `${callerFilePath}: maximum include depth (${MAX_INCLUDE_DEPTH}) exceeded`,
      );
    }

    const raw = fs.readFileSync(resolved, 'utf-8');
    const content = stripHtmlComments(raw);

    const nestedInclude = createIncludeFunction(
      resolved,
      templateParams,
      depth + 1,
    );
    const nestedParams = { ...templateParams, include: nestedInclude };

    try {
      return _.template(content)(nestedParams);
    } catch (err) {
      throw new Error(
        `${resolved}: Lodash template error in partial: ${(err as Error).message}`,
        { cause: err },
      );
    }
  };
}
