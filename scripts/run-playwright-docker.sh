#!/usr/bin/env bash
set -euo pipefail

# Runs Playwright itself in Docker/Podman, matching the exact locked
# @playwright/test version, rather than requiring a system browser install
# on every host this runs on - the VM never had a working chromium at any
# of the paths a hardcoded PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH could assume.
# Foundry already runs containerized; the browser runs the same way now.
PLAYWRIGHT_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

# foundry-playwright-, not a random name: force_remove_foundry_containers()
# in ops/vm/verify-renovate-prs.sh already sweeps anything matching this
# prefix, so a timeout that kills this script (candidate test code, same
# credentialless identity as everything else phase B runs) still gets this
# container cleaned up via that existing mechanism instead of needing its
# own separate handling.
# Project-scoped for the same reason run-e2e-docker.mjs scopes its own
# container/network names - see its comment. npm propagates
# npm_package_name through this whole process chain (confirmed live), so
# the fallback only matters if this script is ever invoked bare.
CONTAINER_NAME="foundry-playwright-e2e-runner-${npm_package_name:-foundry-playwright}"

# This can run against a Renovate candidate branch whose `npm ci` may have
# executed untrusted lifecycle scripts, and the e2e test files themselves
# are also candidate-controlled - mounting the checkout as-is would hand a
# modified test read access to anything a compromised dependency planted
# there, e.g. a fake .env (playwright.config.ts loads one if present). No
# real credential currently lives in this tree during the VM pipeline, but
# closing that off at the source is cheap insurance against relying on
# that staying true.
#
# Overlay /dev/null onto each .env-shaped path INSIDE the container
# instead of touching the host file at all (matching
# foundry-playwright's own runPlaywrightInContainer - see its
# scripts/verify-local.ts). An earlier version of this script instead
# deleted these paths outright (`rm -f .env .env.*`) - safe for the VM
# pipeline's fresh, disposable checkouts, but this script also runs
# against a real local checkout during dev (test:e2e:docker), where .env
# is a legitimate file with real credentials - that version deleted it
# with no backup and no way to recover it. Never touching the host file
# has no such failure mode.
env_mounts=()
shopt -s nullglob
for f in .env .env.*; do
  env_mounts+=(-v "/dev/null:/work/$f:ro")
done
shopt -u nullglob

# FOUNDRY_E2E_NETWORK (set by scripts/run-e2e-docker.mjs, which also
# creates it and joins Foundry's own container to it via buildRunArgs) -
# not --network=host, and not the published host port via a loopback
# alias like host.containers.internal. --network=host would join the real
# host network namespace, exposing every other host-bound service (sshd,
# etc.) to this candidate-controlled test code - directly against the
# reason every other identity in this pipeline is this carefully
# isolated. Reaching the published port from outside the container (even
# via a loopback alias) instead routes through rootless Podman's userspace
# pasta translation layer, which is measurably slower under load than
# direct container-to-container traffic on a shared bridge - see
# foundry-playwright#110. FOUNDRY_URL is already the container-name-based
# URL (http://<foundry container name>:30000, its internal port -
# unrelated to whatever host port it's published on) by the time this
# script runs; no rewriting needed here.
# CI=1, not a blanket change to playwright.config.ts's own retries
# default: this is an automated verification run (no one's watching a
# terminal to react to a first failure the way local interactive dev
# usage expects), so it should get the same "retry a flaky failure before
# giving up" treatment playwright.config.ts already reserves for CI -
# forbidOnly (fail if a stray .only() was left in) is a reasonable thing
# to also pick up here, not just an incidental side effect.
docker run --rm --name "$CONTAINER_NAME" --network "$FOUNDRY_E2E_NETWORK" --shm-size=1gb \
  -v "$PWD:/work" -w /work \
  "${env_mounts[@]}" \
  -e CI=1 \
  -e FOUNDRY_URL -e PLAYWRIGHT_HTML_REPORT -e PLAYWRIGHT_OUTPUT_DIR \
  -e FOUNDRY_VERSION -e FOUNDRY_SYSTEM_ID \
  "$IMAGE" npx playwright test
