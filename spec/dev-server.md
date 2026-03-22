# Development Server

Tada includes a static file server that serves the contents of `dist/`. The
default port is 8080 and is configurable.

The server decodes URLs, prevents path traversal, and returns appropriate HTTP
status codes for missing files and errors. It can be run independently or is
started automatically in watch mode.
