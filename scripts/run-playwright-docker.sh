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

# foundry-playwright-, not a random name: force_remove_foundry_containers()
# in ops/vm/verify-renovate-prs.sh already sweeps anything matching this
# prefix, so a timeout that kills this script (candidate test code, same
# credentialless identity as everything else phase B runs) still gets this
# container cleaned up via that existing mechanism instead of needing its
# own separate handling.
CONTAINER_NAME="foundry-playwright-e2e-runner"

REPORT_DIR="${PLAYWRIGHT_HTML_REPORT:-playwright-report}"
RESULTS_DIR="${PLAYWRIGHT_OUTPUT_DIR:-test-results}"

sandbox=$(mktemp -d)
trap '
  ec=$?
  # Copy artifacts back out before the sandbox they live in is destroyed -
  # a failed run with nothing left to inspect afterward defeats the point
  # of running verification at all.
  [ -d "$sandbox/$RESULTS_DIR" ] && rsync -a "$sandbox/$RESULTS_DIR/" "$PWD/$RESULTS_DIR/" 2>/dev/null
  [ -d "$sandbox/$REPORT_DIR" ] && rsync -a "$sandbox/$REPORT_DIR/" "$PWD/$REPORT_DIR/" 2>/dev/null
  rm -rf "$sandbox"
  exit "$ec"
' EXIT

rsync -a --exclude='.env' --exclude='.env.*' "$PWD/" "$sandbox/"

# host.containers.internal, not --network=host: this container runs
# candidate-branch test code, and --network=host would join the real host
# network namespace, exposing every other host-bound service (sshd, etc.)
# to it - directly against the reason every other identity in this
# pipeline is this carefully isolated. Podman's rootless pasta backend
# provides this DNS name for reaching the host's own published ports from
# an otherwise fully isolated container network namespace (confirmed
# directly on the target VM) - substitute it into FOUNDRY_URL so the
# baseURL Playwright actually uses still resolves correctly.
container_foundry_url="${FOUNDRY_URL/127.0.0.1/host.containers.internal}"

podman run --rm --name "$CONTAINER_NAME" --shm-size=1gb \
  -v "$sandbox:/work" -w /work \
  -e FOUNDRY_URL="$container_foundry_url" \
  -e PLAYWRIGHT_HTML_REPORT -e PLAYWRIGHT_OUTPUT_DIR \
  -e FOUNDRY_VERSION -e FOUNDRY_SYSTEM_ID \
  "$IMAGE" npx playwright test
