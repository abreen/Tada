#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TADA="$REPO_DIR/bin/tada.ts"
SITE_DIR="$REPO_DIR/playwright/.test-site"

# Clean up any previous test site
rm -rf "$SITE_DIR"

# Init and build
bun run "$TADA" init "$SITE_DIR" --no-interactive --default-time-zone America/New_York
cd "$SITE_DIR"
bun run "$TADA" dev

# Serve (stays running, Playwright connects to this)
exec bun run "$TADA" serve --port 8081
