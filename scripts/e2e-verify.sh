#!/usr/bin/env bash
set -e

# Ensure we are at the repo root
cd "$(dirname "$0")/.."

# foundry-playwright >=1.3.2 no longer auto-loads a .env file itself (it now
# only reads FOUNDRY_USERNAME/PASSWORD/ADMIN_KEY from process.env) - load one
# here if present, for local/dev runs. No-op when absent (e.g. the VM
# automation, which exports these directly rather than keeping a .env file).
#
# Deliberately NOT `source`/`.`  - this repo's own npm ci can run before this
# script (see test:e2e:verify's callers), and a compromised dependency needs
# only the ability to drop a file named .env in the checkout - no code-exec
# during install required - to have it blindly executed as shell here,
# reachable code that also runs after any real credentials are already in
# this process's environment. Parse it as plain KEY=VALUE data instead: a
# value is never interpreted, so it can't inject commands regardless of what
# it contains.
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      '' | *[!A-Za-z0-9_]*) continue ;;
    esac
    export "$key=$value"
  done <.env
fi

# Check for uncommitted changes (excluding .e2e-verification)
if ! git diff-index --quiet HEAD -- . ':!.e2e-verification'; then
    echo "❌ Error: Working directory must be clean before running verification."
    echo "Please commit or stash your changes first."
    exit 1
fi

# Function to calculate hash of all relevant files
calculate_hash() {
    git ls-files -z src/ e2e/ public/ package.json package-lock.json playwright.config.ts vite.config.ts tsconfig*.json .tool-versions | \
    xargs -0 sha256sum | \
    LC_ALL=C sort | \
    sha256sum | \
    cut -d ' ' -f 1
}

echo "🚀 Running E2E tests (Foundry v14, Docker)..."
npm run test:e2e:docker:verbose

# If tests passed, update the verification file
HASH=$(calculate_hash)
echo "$HASH" > .e2e-verification
git add .e2e-verification
git commit -m "chore: verify e2e [hash: ${HASH:0:8}]"

echo "✅ E2E verification successful and committed ($HASH)."
