#!/usr/bin/env bash
set -euo pipefail

# Nightly Renovate-PR e2e re-verification, run by lm-verify-renovate.timer on
# the VM (the same box as foundry-playwright's foundry-verify.timer).
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
# --- Identity split ---
# This service runs as `foundry-verify`, which holds a repo-scoped `gh`
# token and an SSH commit-signing key in its own $HOME. A Renovate PR bumps
# a dependency whose `npm ci` (via install/postinstall lifecycle scripts) or
# build step could be compromised - running that under an identity with
# push/merge credentials would hand a malicious dependency the means to
# forge commits or push arbitrary code as this identity (CWE-829).
#
# So every step that actually executes candidate-branch code - checkout,
# `npm ci`, build, the Docker/Podman e2e run - runs under a second,
# unprivileged system user (`lm-verify-runner`) that has no gh token, no SSH
# key, and no access to foundry-verify's $HOME at all. It only gets the
# Foundry VTT test credentials the e2e suite genuinely needs (via the
# group-shared .env, which holds no GitHub credentials). `foundry-verify`
# only ever runs `git fetch`/`git push`/`gh pr ...` - plain network
# operations that never execute anything from the candidate branch - and
# hands the actual work to lm-verify-runner via `runuser`. See
# lm-verify-renovate.service for the one-time setup (new user, shared
# group, directory permissions) this split requires.
#
# Requires FOUNDRY_USERNAME/PASSWORD/ADMIN_KEY/LICENSE_KEY and
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH in .env (group-readable by both
# identities), and a `gh auth login`'d token with repo scope local to
# foundry-verify only - same as foundry-verify's own nightly job.

REPO="TheFehr/thefehrs-learning-manager"
REPO_DIR="${LM_REPO_DIR:-/opt/thefehrs-learning-manager}"
RUNNER_USER="${LM_RUNNER_USER:-lm-verify-runner}"
RUNNER_GROUP="${LM_RUNNER_GROUP:-lm-verify-shared}"
# foundry-playwright >=1.3.2 no longer requires (or reads) a .env file at all
# - it takes FOUNDRY_USERNAME/PASSWORD/ADMIN_KEY from process.env and writes
# its own short-lived temp file internally, deleted right after the `docker
# run` call regardless of success or failure. So there's no file for us to
# sync or hand-maintain here: lm-verify-runner just sources foundry-playwright's
# own canonical .env directly (see lm-verify-renovate.service for the
# one-time setfacl grant giving it read access to exactly that one file - no
# copy, no drift, no group-shared secret file in this checkout at all).
FOUNDRY_ENV_SOURCE="${FOUNDRY_ENV_SOURCE:-/opt/foundry-playwright/.env}"
# Repo-owned rather than /tmp: a world-writable, predictable path there is
# open to a symlink pre-creation attack from another local user; this path is
# only writable by these two identities (shared group).
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
# below missed. Containers are actually started under lm-verify-runner's
# rootless Podman namespace (see the identity split above), not
# foundry-verify's, so the prune has to target that namespace too. Runs via
# EXIT trap rather than as a last step so it still fires if an earlier
# command aborts the script under `set -e`.
trap '
  runuser -u "$RUNNER_USER" -- podman system prune -f >/dev/null 2>&1 || true
  podman system prune -f >/dev/null 2>&1 || true
' EXIT

used_pct=$(df --output=pcent "$REPO_DIR" | tail -1 | tr -dc '0-9')
if [ "$used_pct" -gt "$MAX_DISK_USED_PCT" ]; then
  echo "[verify-renovate-prs] Disk usage at ${used_pct}%, aborting run." >&2
  exit 1
fi

# -f: a run that crashed between e2e-verify.sh staging .e2e-verification and
# committing it (or between the runner's checkout and foundry-verify's
# return-to-main below) can leave the tree dirty. A plain checkout would
# then fail under set -e, wedging every future run until someone notices -
# force it instead, every time this script returns to main.
git checkout -f main
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
else
  attempted=0
  while IFS=$'\t' read -r pr_number branch; do
    [ "$attempted" -ge "$MAX_ATTEMPTS_PER_RUN" ] && break
    attempted=$((attempted + 1))

    echo "[verify-renovate-prs] PR #$pr_number ($branch): verifying..."
    # Fetch is a pure network/credentialed git operation - nothing from the
    # candidate branch executes yet, so this stays on foundry-verify. Pin to
    # the fetched SHA rather than re-resolving origin/$branch later, so a
    # Renovate rebase mid-run can't hand the runner a moving target.
    git fetch origin "$branch"
    before_sha=$(git rev-parse "origin/$branch")

    # --- Untrusted phase (lm-verify-runner) ---
    # Everything that executes candidate-branch code happens here, under an
    # identity with no gh token, no SSH key, and no access to
    # foundry-verify's $HOME. Values are passed via `env` rather than
    # interpolated into the script text, so a branch name can't inject
    # anything into the command run as this identity. FOUNDRY_ENV_SOURCE is
    # just a path, not a secret - the file it points at is only readable by
    # this identity via the one-time setfacl grant (see
    # lm-verify-renovate.service), never copied or group-shared.
    verify_status=0
    runuser -u "$RUNNER_USER" -- env REPO_DIR="$REPO_DIR" BRANCH="$branch" BASE_SHA="$before_sha" \
      FOUNDRY_ENV_SOURCE="$FOUNDRY_ENV_SOURCE" \
      bash -c '
        set -e
        umask 002
        cd "$REPO_DIR"
        git checkout -f -B "$BRANCH" "$BASE_SHA"
        # Mirrors .github/actions/setup-and-cache: submodules + generated
        # external types are required for the build and are not part of a
        # plain checkout/npm ci.
        git submodule update --init --recursive
        npm ci
        npm run generate-types
        set -a
        . "$FOUNDRY_ENV_SOURCE"
        set +a
        npm run test:e2e:verify
      ' || verify_status=$?

    if [ "$verify_status" -ne 0 ]; then
      echo "[verify-renovate-prs] PR #$pr_number: verify failed (status $verify_status), leaving branch alone."
      gh pr comment "$pr_number" --repo "$REPO" --body \
        "Nightly e2e re-verification failed for this update (exit $verify_status). Needs a manual look before it can merge - see the VM's verify-renovate-prs log for details." \
        || true
      git checkout -f main
      continue
    fi

    if [ "$(git rev-parse HEAD)" = "$before_sha" ]; then
      echo "[verify-renovate-prs] PR #$pr_number: verify passed but produced no commit (hash already matched?), skipping."
      git checkout -f main
      continue
    fi

    if is_in_push_blackout; then
      echo "[verify-renovate-prs] PR #$pr_number: verified, but within the push blackout - leaving unpushed for tonight."
      git checkout -f main
      continue
    fi

    # --- Back to foundry-verify ---
    # The only two credentialed actions in this loop: pushing the runner's
    # commit, and enabling auto-merge. Neither executes anything from the
    # candidate branch.
    if ! git push origin HEAD:"$branch"; then
      echo "[verify-renovate-prs] PR #$pr_number: push rejected (branch moved under us, likely a Renovate rebase) - skipping, will retry next run."
      git checkout -f main
      continue
    fi

    if ! gh pr merge "$pr_number" --repo "$REPO" --auto --squash --delete-branch; then
      echo "[verify-renovate-prs] PR #$pr_number: verified and pushed, but enabling auto-merge failed."
      gh pr comment "$pr_number" --repo "$REPO" --body \
        "e2e re-verification passed and the hash was pushed, but enabling auto-merge failed - needs a manual \`gh pr merge\`." \
        || true
      git checkout -f main
      continue
    fi

    git checkout -f main

    # Stop here, regardless of MAX_ATTEMPTS_PER_RUN: this PR merging will
    # change package-lock.json on main, which makes Renovate rebase every
    # other open PR onto the new main - invalidating anything else verified
    # in the same run before that merge and rebase actually happen.
    # Remaining candidates get verified fresh (post-rebase) next run.
    echo "[verify-renovate-prs] PR #$pr_number: auto-merge enabled, stopping for tonight (its merge will rebase the rest)."
    break
  done <<<"$candidates"
fi

# Retry auto-merge for any PR that's already fully green (verified by a past
# run, or never needed verification) but doesn't have auto-merge enabled -
# closes the gap where a transient `gh pr merge` failure above would
# otherwise never be retried, since such a PR no longer matches the
# verify-candidate query once check-e2e turns green. Cheap and safe: no
# checkout, no code execution, just a credentialed gh call.
stuck_green=$(gh pr list --repo "$REPO" --author "app/renovate" --state open \
  --json number,mergeable,autoMergeRequest,statusCheckRollup --jq '
    .[] | select(.mergeable == "MERGEABLE") | select(.autoMergeRequest == null) |
    select([.statusCheckRollup[] | select(.name == "test") | .conclusion] == ["SUCCESS"]) |
    select([.statusCheckRollup[] | select(.name == "check-e2e") | .conclusion] == ["SUCCESS"]) |
    .number
  ')
for pr_number in $stuck_green; do
  echo "[verify-renovate-prs] PR #$pr_number: already green but auto-merge not enabled, retrying."
  gh pr merge "$pr_number" --repo "$REPO" --auto --squash --delete-branch ||
    echo "[verify-renovate-prs] PR #$pr_number: retry also failed, will try again next run."
done

exit 0
