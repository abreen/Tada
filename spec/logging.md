# Logging

Build log verbosity is controlled by the `TADA_LOG_LEVEL` environment variable.
Valid levels from most to least verbose: `debug`, `info`, `warn`, `error`. The
default level is `info`.

An `event` level always writes regardless of the configured minimum level,
used in watch mode to report rebuilds and config changes.
