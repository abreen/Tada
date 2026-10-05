# Development Server

Tada includes a static file server that serves the contents of `dist/`. The
default port is 8080 and is configurable. Use `--port 0` with `tada serve` or
`tada watch` to let the operating system assign an available port when the
server binds. The startup message reports the assigned port.

The server decodes URLs, prevents path traversal, and returns appropriate HTTP
status codes for missing files and errors. It can be run independently or is
started automatically in watch mode.

Containment checks treat `..` as a parent-directory segment, so files and
directories with names beginning with two dots (such as `..notes.html` or
`..assets/`) are served normally when they remain inside `dist/`.

For existing files, both `GET` and `HEAD` responses include `Cache-Control:
no-cache` and `Last-Modified`. The server also honors `If-Modified-Since`,
returning `304` when appropriate.
