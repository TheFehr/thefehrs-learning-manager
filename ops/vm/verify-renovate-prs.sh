#!/usr/bin/env bash
set -euo pipefail

# Nightly Renovate-PR e2e re-verification, run by lm-verify-renovate.timer on
# the VM (the same box/user as foundry-playwright's foundry-verify.timer).
#
# check-e2e requires .e2e-verification's hash to match the tree (see
# scripts/e2e-verify.sh), and that hash covers package.json/package-lock.json
# - so every Renovate PR that bumps a dependency starts with check-e2e
# failing, and stays that way until someone runs `npm run test:e2e:verify`
# locally and pushes the resulting commit. This script does that part
# automatically: for each open Renovate PR stuck on a stale hash, it checks
# the branch out, runs the real Docker-based e2e suite, pushes the commit if
# it passes, and enables auto-merge (branch protection on main already
# requires `test` and `check-e2e`, so GitHub itself won't merge until both
# are green).
#
# Deliberately scoped to Renovate-authored PRs only - a human PR with a
# stale hash is expected to run test:e2e:verify themselves before pushing;
# this is a safety net for the bot, not a replacement for that.
#
# Requires FOUNDRY_USERNAME/PASSWORD/ADMIN_KEY/LICENSE_KEY and
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH in .env, and a `gh auth login`'d token
# with repo scope - both local to this VM only, same as foundry-verify.

REPO="TheFehr/thefehrs-learning-manager"
REPO_DIR="${LM_REPO_DIR:-/opt/thefehrs-learning-manager}"
# Repo-owned rather than /tmp: a world-writable, predictable path there is
# open to a symlink pre-creation attack from another local user; this path is
# only writable by this job itself.
LOCK_FILE="$REPO_DIR/.verify-renovate.lock"
MAX_DISK_USED_PCT=85
# Runtime safety net, not a correctness knob: each attempt is ~30min of
# build+docker-e2e, so this just bounds worst-case run length if several
# candidates in a row fail verify (no merge, so no need to stop for
# correctness - see the hard stop-after-merge below instead).
MAX_ATTEMPTS_PER_RUN=3

cd "$REPO_DIR"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "[verify-renovate-prs] Another run is still in progress, exiting."
  exit 0
fi

# Foundry-version-tagged images are reused across runs and left alone; this
# only clears dangling layers and any container this job's own crash-cleanup
# below missed. Runs via EXIT trap rather than as a last step so it still
# fires if an earlier command aborts the script under `set -e`.
trap 'podman system prune -f >/dev/null 2>&1 || true' EXIT

used_pct=$(df --output=pcent "$REPO_DIR" | tail -1 | tr -dc '0-9')
if [ "$used_pct" -gt "$MAX_DISK_USED_PCT" ]; then
  echo "[verify-renovate-prs] Disk usage at ${used_pct}%, aborting run." >&2
  exit 1
fi

# Always start from a known-clean main, regardless of what a crashed
# previous run may have left checked out.
git checkout main
git pull --ff-only origin main

is_in_push_blackout() {
  local tz_day tz_hm
  tz_day=$(TZ="Europe/Berlin" date +%u)
  tz_hm=$((10#$(TZ="Europe/Berlin" date +%H%M)))
  [[ "$tz_day" =~ ^[1245]$ ]] && [ "$tz_hm" -ge 730 ] && [ "$tz_hm" -lt 1630 ]
}

# Candidates: open, Renovate-authored, not already conflicting (a conflicting
# branch means Renovate itself will force-push a rebase - nothing for us to
# verify until that happens), with `test` green but `check-e2e` red - i.e.
# blocked purely on a stale hash, not a real breakage.
candidates=$(gh pr list --repo "$REPO" --author "app/renovate" --state open \
  --json number,headRefName,mergeable,statusCheckRollup --jq '
    .[] | select(.mergeable == "MERGEABLE") |
    select([.statusCheckRollup[] | select(.name == "test") | .conclusion] == ["SUCCESS"]) |
    select([.statusCheckRollup[] | select(.name == "check-e2e") | .conclusion] == ["FAILURE"]) |
    "\(.number)\t\(.headRefName)"
  ')

if [ -z "$candidates" ]; then
  echo "[verify-renovate-prs] No candidates tonight."
  exit 0
fi

attempted=0
while IFS=$'\t' read -r pr_number branch; do
  [ "$attempted" -ge "$MAX_ATTEMPTS_PER_RUN" ] && break
  attempted=$((attempted + 1))

  echo "[verify-renovate-prs] PR #$pr_number ($branch): verifying..."
  git fetch origin "$branch"
  git checkout -B "$branch" "origin/$branch"
  npm ci

  verify_status=0
  npm run test:e2e:verify || verify_status=$?

  if [ "$verify_status" -ne 0 ]; then
    echo "[verify-renovate-prs] PR #$pr_number: verify failed (status $verify_status), leaving branch alone."
    gh pr comment "$pr_number" --repo "$REPO" --body \
      "Nightly e2e re-verification failed for this update (exit $verify_status). Needs a manual look before it can merge - see the VM's verify-renovate-prs log for details." \
      || true
    git checkout main
    continue
  fi

  if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" ]; then
    echo "[verify-renovate-prs] PR #$pr_number: verify passed but produced no commit (hash already matched?), skipping."
    git checkout main
    continue
  fi

  if is_in_push_blackout; then
    echo "[verify-renovate-prs] PR #$pr_number: verified, but within the push blackout - leaving unpushed for tonight."
    git checkout main
    continue
  fi

  if ! git push origin HEAD:"$branch"; then
    echo "[verify-renovate-prs] PR #$pr_number: push rejected (branch moved under us, likely a Renovate rebase) - skipping, will retry next run."
    git checkout main
    continue
  fi

  # Idempotent: if a prior run already enabled auto-merge on this PR, this
  # just no-ops (gh reports it, doesn't fail the run).
  gh pr merge "$pr_number" --repo "$REPO" --auto --squash --delete-branch || true

  git checkout main

  # Stop here, regardless of MAX_ATTEMPTS_PER_RUN: this PR merging will
  # change package-lock.json on main, which makes Renovate rebase every
  # other open PR onto the new main - invalidating any hash we'd verify and
  # push for them right now before that merge and rebase actually happen.
  # Remaining candidates get verified fresh (post-rebase) next run.
  echo "[verify-renovate-prs] PR #$pr_number: auto-merge enabled, stopping for tonight (its merge will rebase the rest)."
  break
done <<<"$candidates"

exit 0
