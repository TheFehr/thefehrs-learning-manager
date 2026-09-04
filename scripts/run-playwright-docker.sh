#!/usr/bin/env bash
set -euo pipefail

# Runs Playwright itself in Docker/Podman, matching the exact locked
# @playwright/test version, rather than requiring a system browser install
# on every host this runs on - the VM never had a working chromium at any
# of the paths a hardcoded PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH could assume.
# Foundry already runs containerized; the browser runs the same way now.
#
# Mounts a sanitized COPY of the checkout, never the checkout itself: this
# can run against a Renovate candidate branch whose `npm ci` may have
# executed untrusted lifecycle scripts, and the e2e test files themselves
# are also candidate-controlled - mounting the live tree directly would
# hand a modified test read access to anything a compromised dependency
# planted there (e.g. a fake .env), even though no real credential
# currently lives in this tree. Excluding .env-shaped files explicitly is
# cheap insurance against relying on that staying true.
PLAYWRIGHT_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT

rsync -a --exclude='.env' --exclude='.env.*' "$PWD/" "$sandbox/"

podman run --rm --network=host --shm-size=1gb \
  -v "$sandbox:/work" -w /work \
  -e FOUNDRY_URL -e PLAYWRIGHT_HTML_REPORT -e PLAYWRIGHT_OUTPUT_DIR \
  -e FOUNDRY_VERSION -e FOUNDRY_SYSTEM_ID \
  "$IMAGE" npx playwright test
