#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js 24 or newer is required. Select Node 24 in the environment."); process.exit(1); }'
# Use an existing pinned pnpm, otherwise bootstrap it through standard npm/npx.
if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm --version)" = "11.25.0" ]; then
  pnpm install --frozen-lockfile --store-dir .pnpm-store
elif command -v npx >/dev/null 2>&1; then
  npx --yes pnpm@11.25.0 install --frozen-lockfile --store-dir .pnpm-store
else
  echo "Install pnpm 11.25.0, or use a Node 24 installation including npm/npx." >&2
  exit 1
fi
