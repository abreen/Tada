import { inspect } from 'node:util';
import path from 'path';
import { Gi, L, Ri, P, Yi, Li } from './colors';
import type { Logger } from './types';
import FLAIR_STRINGS from './flair.json' with { type: 'json' };

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

type LogLevel = (typeof LEVELS)[number];

const ENV_LOG_LEVEL = process.env.TADA_LOG_LEVEL;

if (ENV_LOG_LEVEL && !LEVELS.includes(ENV_LOG_LEVEL as LogLevel)) {
  throw new Error(
    `Invalid TADA_LOG_LEVEL "${ENV_LOG_LEVEL}", must be one of: ${LEVELS.join(', ')}`,
  );
}

function shouldLog(loggerLevel: string, level: string): boolean {
  return (
    LEVELS.indexOf(level as LogLevel) >= LEVELS.indexOf(loggerLevel as LogLevel)
  );
}

function validateLevel(level: string): void {
  if (!LEVELS.includes(level as LogLevel)) {
    throw new Error(
      `Invalid log level "${level}", must be one of: ${LEVELS.join(', ')}`,
    );
  }
}

function print(
  strings: string[],
  stream: 'stdout' | 'stderr' = 'stdout',
  end: string = '\n',
): void {
  for (const s of strings) {
    process[stream].write(s);
  }
  process[stream].write(end);
}

export function makeLogger(name: string, logLevel: string = 'info'): Logger {
  validateLevel(logLevel);

  if (ENV_LOG_LEVEL) {
    logLevel = ENV_LOG_LEVEL;
  }

  if (!name) {
    name = '';
  } else {
    // Allow for passing __filename
    name = path.basename(name, path.extname(name));
  }

  const logger: Logger = {
    minLogLevel: logLevel,
    /** Don't log if the level is < minLogLevel */
    setMinLogLevel(minLogLevel: string) {
      this.minLogLevel = minLogLevel;
    },
    getArgs(
      level: string,
      strings: TemplateStringsArray | string | string[],
      args: unknown[],
      labelFn: (strings: TemplateStringsArray, ...args: unknown[]) => string,
    ): string[] {
      const params: string[] = [];
      params.push(
        labelFn` ${level} ` + ' ' + (level === 'debug' ? name + ' ' : ''),
      );
      params.push(format(strings, ...args));
      return params;
    },
    debug(strings: TemplateStringsArray, ...args: unknown[]) {
      if (shouldLog(this.minLogLevel, 'debug')) {
        print(this.getArgs('debug', strings, args, L), 'stderr');
      }
    },
    info(strings: TemplateStringsArray, ...args: unknown[]) {
      if (shouldLog(this.minLogLevel, 'info')) {
        print(this.getArgs('info', strings, args, Li));
      }
    },
    warn(strings: TemplateStringsArray, ...args: unknown[]) {
      if (shouldLog(this.minLogLevel, 'warn')) {
        print(this.getArgs('warn', strings, args, Yi));
      }
    },
    error(strings: TemplateStringsArray, ...args: unknown[]) {
      if (shouldLog(this.minLogLevel, 'error')) {
        print(this.getArgs('error', strings, args, Ri));
      }
    },
    event(strings: TemplateStringsArray, ...args: unknown[]) {
      print(this.getArgs('event', strings, args, Gi));
    },
    followup(strings: string[]) {
      print(strings);
    },
  };

  logger.setMinLogLevel(logLevel);
  return logger;
}

function format(
  strings: TemplateStringsArray | string | string[],
  ...args: unknown[]
): string {
  // Called as template tag: first arg is an array-like with .raw
  if (strings && typeof strings === 'object' && 'raw' in strings) {
    try {
      return String.raw(strings as TemplateStringsArray, ...args.map(toString));
    } catch {
      // fallback to safe join
    }
  } else {
    if (Array.isArray(strings)) {
      args.unshift(...strings);
    } else {
      args.unshift(strings);
    }

    return args.map(toString).join(' ');
  }

  return '';
}

function toString(item: unknown): string {
  if (item === undefined) {
    return 'undefined';
  }
  if (item === null) {
    return 'null';
  }
  if (typeof item === 'string') {
    return item;
  }

  try {
    if (typeof item === 'object') {
      return inspect(item, {
        compact: true,
        depth: 2,
        breakLength: 80,
        maxStringLength: 250,
        colors: true,
      });
    }
    throw new Error('not an object');
  } catch {
    return String(item);
  }
}

export function getFlair(): string {
  const i = Math.floor(Math.random() * FLAIR_STRINGS.length);
  return P`${FLAIR_STRINGS[i]}!` + ' 🎉';
}

export function printFlair(): void {
  console.log(getFlair());
}
