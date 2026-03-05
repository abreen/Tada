const { inspect } = require('node:util');
const path = require('path');
const { G, R, P, Y, L } = require('./colors');
const FLAIR_STRINGS = require('./flair.json');

const LEVELS = ['debug', 'note', 'warn', 'error'];
const LEVELS_PRETTY = ['ᴅᴇʙᴜɢ', ' ɴᴏᴛᴇ', ' ᴡᴀʀɴ', 'ᴇʀʀᴏʀ'];

function shouldLog(loggerLevel, level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(loggerLevel);
}

function validateLevel(level) {
  if (!LEVELS.includes(level)) {
    throw new Error(
      `Invalid log level "${level}", must be one of: ${LEVELS.join(', ')}`,
    );
  }
}

function prettyLevel(level) {
  if (level === 'event') {
    return 'ᴇᴠᴇɴᴛ';
  }
  const i = LEVELS.indexOf(level);
  return LEVELS_PRETTY[i] || level;
}

function print(strings, stream = 'stdout', end = '\n') {
  for (const s of strings) {
    process[stream].write(s);
  }
  process[stream].write(end);
}

function makeLogger(name, logLevel = 'note') {
  validateLevel(logLevel);

  if (!name) {
    name = '';
  } else {
    // Allow for passing __filename
    name = path.basename(name);
  }

  const logger = {
    /** Don't log if the level is < minLogLevel */
    setMinLogLevel(minLogLevel) {
      this.minLogLevel = minLogLevel;
    },
    getArgs(level, strings, args, colorFn) {
      const params = [];
      params.push(colorFn`${prettyLevel(level)}` + '\t');
      params.push(format(strings, ...args));
      return params;
    },
    debug(strings, ...args) {
      if (shouldLog(this.minLogLevel, 'debug')) {
        print(this.getArgs('debug', strings, args, L), 'stderr');
      }
    },
    note(strings, ...args) {
      if (shouldLog(this.minLogLevel, 'note')) {
        print(this.getArgs('note', strings, args, L));
      }
    },
    warn(strings, ...args) {
      if (shouldLog(this.minLogLevel, 'warn')) {
        print(this.getArgs('warn', strings, args, Y));
      }
    },
    error(strings, ...args) {
      if (shouldLog(this.minLogLevel, 'error')) {
        print(this.getArgs('error', strings, args, R));
      }
    },
    event(strings, ...args) {
      print(this.getArgs('event', strings, args, G));
    },
    followup(strings) {
      print(strings);
    },
  };

  logger.setMinLogLevel(logLevel);
  return logger;
}

function format(strings, ...args) {
  // Called as template tag: first arg is an array-like with .raw
  if (strings && typeof strings === 'object' && 'raw' in strings) {
    try {
      return String.raw(strings, ...args.map(toString));
    } catch (e) {
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
}

function toString(item) {
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
  } catch (e) {
    return String(item);
  }
}

function getFlair() {
  const i = Math.floor(Math.random() * FLAIR_STRINGS.length);
  return P`${FLAIR_STRINGS[i]}!` + ' 🎉';
}

module.exports = { makeLogger, getFlair };
