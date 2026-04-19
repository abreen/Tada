# Development Server

Tada includes a static file server that serves the contents of `dist/`. The
default port is 8080 and is configurable.

The server decodes URLs, prevents path traversal, and returns appropriate HTTP
status codes for missing files and errors. It can be run independently or is
started automatically in watch mode.

For existing files, both `GET` and `HEAD` responses include `Cache-Control:
no-cache` and `Last-Modified`. The server also honors `If-Modified-Since`,
returning `304` when appropriate.
