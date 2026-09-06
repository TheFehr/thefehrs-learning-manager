#!/usr/bin/env bash
set -e

# Ensure we are at the repo root
cd "$(dirname "$0")/.."

# foundry-playwright >=1.3.2 no longer auto-loads a .env file itself (it now
# only reads FOUNDRY_USERNAME/PASSWORD/ADMIN_KEY from process.env). This
# script doesn't load one either - deliberately: this repo's own npm ci can
# run before this script, and a compromised dependency needs only the
# ability to drop a file named .env in the checkout (no code-exec during
# install required) to have it read as credentials-adjacent data right after
# the real ones are loaded. For local dev, use `npm run test:e2e:verify:local`
# instead of calling this directly - it loads .env via Node's own built-in
# `--env-file-if-exists` before this script ever runs, so nothing here needs
# to know .env exists at all. The VM automation exports real credentials
# into its shell before calling this script, so there's nothing to load here
# either way.

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
