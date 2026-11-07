#!/bin/sh
set -eu
if [ -f .output/server/index.mjs ]; then
  exec bun .output/server/index.mjs
fi
if [ -f dist/server/server.js ]; then
  exec bun dist/server/server.js
fi
echo "Frontend server bundle was not found." >&2
find . -name 'index.mjs' -o -name 'server.js' | head -n 40 >&2
exit 1
