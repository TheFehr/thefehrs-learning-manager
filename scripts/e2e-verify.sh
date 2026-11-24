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

# Check for uncommitted changes, staged or untracked included: the result is reported for
# HEAD's SHA, so the tested tree must be exactly HEAD's (ignored build output is fine).
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Error: Working directory must be clean before running verification."
    echo "Please commit or stash your changes first."
    exit 1
fi

SHA=$(git rev-parse HEAD)

echo "🚀 Running E2E tests (Foundry v14, Docker) on ${SHA}..."
npm run test:e2e:docker:verbose

# The suite reads the working tree while it runs, so make sure it still is the commit that
# was checked at the start (a moved HEAD or a changed or new file would make the result
# describe a different tree). e2e/screenshots/ is excluded: every run regenerates those PNGs
# and they are documentation of the current UI, not an input of the suite.
if [ "$(git rev-parse HEAD)" != "$SHA" ] || [ -n "$(git status --porcelain -- . ':!e2e/screenshots')" ]; then
    echo "❌ Error: The working tree changed while the tests were running; the result does not describe ${SHA}."
    exit 1
fi

# Nothing is committed: the result belongs to the commit that was tested, and whatever
# automation ran this reports it for exactly that SHA (the `e2e/local` commit status).
echo "✅ E2E verification successful for ${SHA}."
