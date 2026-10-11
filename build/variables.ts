import fs from 'fs';
import path from 'path';
import {
  replaceOutsideHtmlComments,
  stripHtmlComments,
} from './utils/html-comments';
import { isInside, toDisplayPath } from './utils/paths';
import type { SiteVariables } from './types';

/**
 * Site variable substitution for author content. Authors write `{{ name }}`
 * (or a dotted path like `{{ course.code }}`) to insert a value from the
 * `vars` object in the site config. Substitution is plain text replacement,
 * done before Markdown or HTML processing, everywhere: prose, code, and source
 * files. Only bare identifier paths are variables, so text like
 * `{{ count + 1 }}` stays literal, and three opening braces start a partial
 * directive (`{{{ _partial.md }}}`), never a variable. A backslash escapes a
 * variable (`\{{ name }}` is literal text); backslashes pair up, so
 * `\\{{ name }}` is a backslash followed by the value.
 */
const VARIABLE_PATTERN =
  /(?<!\\)(\\*)(?<!\{)\{\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}\}/g;

/** A YAML key produced by an unquoted `{{ name }}` value (a flow mapping) */
const UNQUOTED_VARIABLE_KEY = '[object Object]';

/** A YAML `key: value` line whose value starts with an unquoted `{{` */
const UNQUOTED_VARIABLE_LINE =
  /^([ \t]*(?:-[ \t]+)?([^\s#'"][^:#\n]*?):[ \t]+)(\{\{.*?)[ \t]*$/gm;

export function getSiteVars(
  siteVariables: Pick<SiteVariables, 'vars'>,
): Record<string, unknown> {
  return siteVariables.vars ?? {};
}

function lookUp(vars: Record<string, unknown>, path: string): unknown {
  let value: unknown = vars;
  for (const segment of path.split('.')) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Object.hasOwn(value, segment)
    ) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function valueText(
  vars: Record<string, unknown>,
  path: string,
  displayPath: string,
): string {
  const label = `"{{ ${path} }}"`;
  const value = lookUp(vars, path);
  if (value === undefined) {
    throw new Error(
      `${displayPath}: unknown variable ${label}; define it under "vars" in the site config, or write \\{{ to keep it as literal text`,
    );
  }
  if (value === null) {
    return '';
  }
  if (typeof value === 'object') {
    const kind = Array.isArray(value) ? 'an array' : 'an object';
    throw new Error(
      `${displayPath}: variable ${label} is ${kind}; only strings, numbers, and booleans can be inserted`,
    );
  }
  return String(value);
}

export function substituteVariables(
  text: string,
  vars: Record<string, unknown>,
  displayPath: string,
): string {
  return text.replace(
    VARIABLE_PATTERN,
    (match: string, backslashes: string, path: string) => {
      const literal = '\\'.repeat(Math.floor(backslashes.length / 2));
      return backslashes.length % 2 === 1
        ? literal + match.slice(backslashes.length)
        : literal + valueText(vars, path, displayPath);
    },
  );
}

/**
 * Substitutes variables in a page or partial, ignoring `<!--- -->` comments.
 * Comments are removed first, or kept for literate Java pages, which compile
 * the code in hidden code blocks and so substitute it like visible code.
 */
export function substituteContent(
  content: string,
  vars: Record<string, unknown>,
  filePath: string,
  preserveHtmlComments = false,
): string {
  const substitute = (text: string) =>
    substituteVariables(text, vars, toDisplayPath(filePath));
  return preserveHtmlComments
    ? replaceOutsideHtmlComments(content, substitute)
    : substitute(stripHtmlComments(content));
}

/**
 * Reads a source file as Tada publishes it. Variables are substituted in
 * files in the content directory whose extension is mapped in
 * `extensionToShikiLanguage`; other files are read as written.
 */
export function readSourceFile(
  filePath: string,
  contentDir: string,
  siteVariables: SiteVariables,
): string {
  const text = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).slice(1).toLowerCase();
  // Case-insensitive, like the source scan that decides which files get code pages
  const mapped = Object.keys(siteVariables.extensionToShikiLanguage ?? {}).some(
    key => key.toLowerCase() === ext,
  );
  return mapped && isInside(contentDir, filePath)
    ? substituteVariables(
        text,
        getSiteVars(siteVariables),
        toDisplayPath(filePath),
      )
    : text;
}

function unquotedVariableError(
  displayPath: string,
  key: string,
  cause?: unknown,
): Error {
  const where = key ? ` for "${key}"` : '';
  return new Error(
    `${displayPath}: a value${where} starts with an unquoted {{ }} variable; quote it, for example "{{ name }}"`,
    { cause },
  );
}

/** Fails for a value that YAML parsed as a mapping from `title: {{ name }}` */
function assertNoUnquotedVariables(
  value: unknown,
  displayPath: string,
  key = '',
): void {
  if (Array.isArray(value)) {
    value.forEach(item => assertNoUnquotedVariables(item, displayPath, key));
  } else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === UNQUOTED_VARIABLE_KEY) {
        throw unquotedVariableError(displayPath, key);
      }
      assertNoUnquotedVariables(child, displayPath, childKey);
    }
  }
}

/**
 * Parses YAML whose string values can use variables. YAML reads an unquoted
 * value that starts with `{{` as a mapping, or rejects it when more text
 * follows, so both fail with an error that names the field and says to quote
 * the value.
 */
export function parseYamlWithVariables(
  text: string,
  displayPath: string,
  parse: (text: string) => unknown,
): unknown {
  let value: unknown;
  try {
    value = parse(text);
  } catch (error) {
    // Blame an unquoted variable only if quoting such values fixes the YAML
    const key = [...text.matchAll(UNQUOTED_VARIABLE_LINE)][0]?.[2];
    if (key === undefined) {
      throw error;
    }
    try {
      parse(
        text.replace(
          UNQUOTED_VARIABLE_LINE,
          (_line, prefix: string, _key, value: string) =>
            prefix + JSON.stringify(value),
        ),
      );
    } catch {
      throw error;
    }
    throw unquotedVariableError(displayPath, key, error);
  }
  assertNoUnquotedVariables(value, displayPath);
  return value;
}
