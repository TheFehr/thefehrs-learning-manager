#!/usr/bin/env bash
set -e

# Ensure we are at the repo root
cd "$(dirname "$0")/.."

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: Working directory must be clean before running verification."
    echo "Please commit or stash your changes first."
    exit 1
fi

echo "🚀 Running E2E tests..."
npm run test:e2e:run

# If tests passed, update the verification file
COMMIT=$(git rev-parse HEAD)
echo "$COMMIT" > .e2e-verification
git add .e2e-verification
git commit -m "chore: verify e2e"

echo "✅ E2E verification successful and committed ($COMMIT)."
