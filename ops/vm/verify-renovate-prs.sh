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
# --- Two identities, two checkouts, root as the only thing that touches both ---
# `foundry-verify` holds a repo-scoped `gh` token and an SSH commit-signing
# key in its own $HOME. It owns FV_DIR (its own private checkout) and only
# ever runs `git fetch`/`push`/`gh pr ...` there - plain network operations,
# never candidate-branch code.
#
# `lm-verify-runner` is a second, unprivileged system user that runs `git
# checkout`, `npm ci`, the build, and the actual Docker/Podman e2e suite -
# i.e. everything that executes code from a Renovate PR's dependency bump.
# It has no gh token, no SSH key, and no filesystem access to FV_DIR or
# foundry-verify's $HOME at all - not even read access. A compromised
# dependency's install/postinstall script (CWE-829) has nothing to steal
# that could push, merge, or forge commits as foundry-verify.
#
# Critically, the two identities never share a working .git directory.
# Sharing one (even via group permissions, never sharing UIDs) would let a
# compromised dependency plant a hook (.git/hooks/pre-push, etc.) during the
# untrusted phase that then executes AS foundry-verify the next time it runs
# git in that same tree - defeating the identity split entirely regardless
# of how carefully the UIDs themselves are separated. Instead, this script
# (run as root by systemd - see lm-verify-renovate.service) hands the
# candidate branch to lm-verify-runner as a `git bundle` - inert object data,
# not a live repo, so nothing in it can plant a hook - and gets the verified
# commit back the same way. Root only ever copies/chowns these small bundle
# files between two directories it fully controls; it never executes
# anything from the candidate branch itself, and never runs git/npm/gh
# directly - every actual operation is dispatched to the correct identity
# via `runuser`.
#
# Requires FOUNDRY_USERNAME/PASSWORD/ADMIN_KEY in foundry-playwright's own
# .env (foundry-verify's account, real credentials - not a disposable test
# instance). lm-verify-runner is never granted standing access to that file:
# root copies it into a fresh mktemp'd directory (never a fixed name inside
# the candidate-controlled workdir - see the staging step for why) and
# chowns just that copy to lm-verify-runner, only right before the one step
# that actually needs it (after `npm ci`/`generate-types` have already run)
# - a compromised dependency's lifecycle scripts get no window to read it,
# since the identity that runs them has no access to Foundry credentials at
# all until after they're done. Also requires a `gh auth login`'d token
# with repo scope local to foundry-verify only.

REPO="TheFehr/thefehrs-learning-manager"
FV_DIR="${LM_FV_DIR:-/opt/thefehrs-learning-manager}"
RUNNER_USER="${LM_RUNNER_USER:-lm-verify-runner}"
FOUNDRY_ENV_SOURCE="${FOUNDRY_ENV_SOURCE:-/opt/foundry-playwright/.env}"
# Root-owned scratch space for bundle handoffs - deliberately outside both
# FV_DIR and lm-verify-runner's home, so neither identity's own directory
# permissions are involved in the handoff at all.
HANDOFF_DIR="${LM_HANDOFF_DIR:-/opt/.lm-verify-handoff}"
# Repo-owned rather than /tmp: a world-writable, predictable path there is
# open to a symlink pre-creation attack from another local user; this path is
# only writable by root.
LOCK_FILE="$HANDOFF_DIR/.verify-renovate.lock"
MAX_DISK_USED_PCT=85
# Runtime safety net, not a correctness knob: each attempt is ~30min of
# build+docker-e2e, so this just bounds worst-case run length if several
# candidates in a row fail verify (no merge, so no need to stop for
# correctness - see the hard stop-after-merge below instead).
MAX_ATTEMPTS_PER_RUN=3

mkdir -p "$HANDOFF_DIR"
chown root:root "$HANDOFF_DIR"
chmod 700 "$HANDOFF_DIR"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "[verify-renovate-prs] Another run is still in progress, exiting."
  exit 0
fi

# Foundry-version-tagged images are reused across runs and left alone; this
# only clears dangling layers and any container this job's own crash-cleanup
# missed. Containers are actually started under lm-verify-runner's rootless
# Podman namespace, not foundry-verify's or root's, so cleanup has to be
# dispatched there specifically via runuser - a bare `podman` call here would
# just operate on root's own (irrelevant, empty) namespace.
#
# Also removes the current candidate's $workdir (a full checkout +
# node_modules) if one is in flight. The main loop already removes it at
# every continue/success point, but a crash under `set -e` between creating
# it and reaching one of those, or a TimeoutStartSec kill, would otherwise
# skip all of them and leak it - and each leaked workdir brings the next
# run closer to tripping the disk-usage guard above. Single-quoted so
# $workdir is read at trap-fire time, not when the trap is registered.
#
# Runs via EXIT trap rather than as a last step so all of this still fires
# if an earlier command aborts the script under `set -e`.
trap '
  runuser -u "$RUNNER_USER" -- podman system prune -f >/dev/null 2>&1 || true
  rm -f "$HANDOFF_DIR"/*.bundle 2>/dev/null || true
  if [ -n "${workdir:-}" ]; then
    runuser -u "$RUNNER_USER" -- rm -rf "$workdir" 2>/dev/null || true
  fi
' EXIT

used_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$used_pct" -gt "$MAX_DISK_USED_PCT" ]; then
  echo "[verify-renovate-prs] Disk usage at ${used_pct}%, aborting run." >&2
  exit 1
fi

# -f: a run that crashed mid-way can leave FV_DIR's tree dirty. A plain
# checkout would then fail under set -e, wedging every future run until
# someone notices - force it instead, every time this script returns to
# main. FV_DIR is foundry-verify's own private checkout - lm-verify-runner
# never has any access to it, so there's no hook-planting risk in running
# git here.
runuser -u foundry-verify -- env FV_DIR="$FV_DIR" bash -c '
  set -e
  cd "$FV_DIR"
  git checkout -f main
  git pull --ff-only origin main
'

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
candidates=$(runuser -u foundry-verify -- gh pr list --repo "$REPO" --author "app/renovate" --state open \
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
    out_bundle="$HANDOFF_DIR/candidate-$pr_number.bundle"
    in_bundle="$HANDOFF_DIR/result-$pr_number.bundle"

    # --- foundry-verify: fetch the candidate branch, export it as a bundle ---
    # A bundle is inert packed object data - nothing in it can plant a hook,
    # unlike handing over a live .git directory would.
    runuser -u foundry-verify -- env FV_DIR="$FV_DIR" BRANCH="$branch" OUT="$out_bundle" bash -c '
      set -e
      cd "$FV_DIR"
      git fetch origin "$BRANCH"
      git branch -f verify-candidate "origin/$BRANCH"
      git bundle create "$OUT" verify-candidate
    '
    before_sha=$(runuser -u foundry-verify -- git -C "$FV_DIR" rev-parse "origin/$branch")
    chown "$RUNNER_USER:$RUNNER_USER" "$out_bundle"

    # --- lm-verify-runner, phase A: clone, checkout, build - NO credentials ---
    # Everything that executes candidate-branch code happens here, under an
    # identity with no gh token, no SSH key, and no filesystem access to
    # FV_DIR or foundry-verify's $HOME at all - not via a shared .git, not
    # via anything else. Values are passed via `env` rather than
    # interpolated into the script text, so a branch name can't inject
    # anything into the command run as this identity. Deliberately no
    # Foundry credentials anywhere in this phase: npm ci and generate-types
    # run dependency lifecycle scripts, and this identity has nothing worth
    # stealing until phase B explicitly stages a disposable copy.
    workdir=$(runuser -u "$RUNNER_USER" -- mktemp -d)
    status=0
    runuser -u "$RUNNER_USER" -- env WORKDIR="$workdir" BUNDLE="$out_bundle" BASE_SHA="$before_sha" bash -c '
      set -e
      umask 077
      git clone "$BUNDLE" "$WORKDIR"
      cd "$WORKDIR"
      git checkout -f -B candidate "$BASE_SHA"
      # Mirrors .github/actions/setup-and-cache: submodules + generated
      # external types are required for the build and are not part of a
      # plain checkout/npm ci.
      git submodule update --init --recursive
      npm ci
      npm run generate-types
    ' || status=$?
    rm -f "$out_bundle"

    if [ "$status" -eq 0 ]; then
      # --- root: stage a disposable, per-run copy of the Foundry credentials ---
      # In a fresh mktemp -d directory, NOT at a fixed name inside
      # $workdir: phase A (already finished by this point) is
      # candidate-controlled, and a fixed path there could have been
      # pre-planted as a symlink to an arbitrary host file. Root's cp/chown
      # would then follow it - cp writing credential content to whatever
      # it points at, chown (no -h) handing ownership of that arbitrary
      # file to lm-verify-runner. mktemp -d creates an unpredictable path
      # atomically, after phase A's process has already exited, so there's
      # no window for it to have pre-planted anything at this exact name.
      creds_dir=$(mktemp -d)
      creds_file="$creds_dir/env"
      cp "$FOUNDRY_ENV_SOURCE" "$creds_file"
      chown -R "$RUNNER_USER:$RUNNER_USER" "$creds_dir"

      # --- lm-verify-runner, phase B: the actual e2e suite, now credentialed ---
      runuser -u "$RUNNER_USER" -- env WORKDIR="$workdir" CREDS="$creds_file" bash -c '
        set -e
        cd "$WORKDIR"
        set -a
        . "$CREDS"
        set +a
        npm run test:e2e:verify
      ' || status=$?
      shred -u "$creds_file" 2>/dev/null || true
      rm -rf "$creds_dir"
    fi

    if [ "$status" -ne 0 ]; then
      echo "[verify-renovate-prs] PR #$pr_number: verify failed (status $status), leaving branch alone."
      runuser -u foundry-verify -- gh pr comment "$pr_number" --repo "$REPO" --body \
        "Nightly e2e re-verification failed for this update (exit $status). Needs a manual look before it can merge - see the VM's verify-renovate-prs log for details." \
        || true
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      continue
    fi

    runner_head=$(runuser -u "$RUNNER_USER" -- git -C "$workdir" rev-parse HEAD)
    if [ "$runner_head" = "$before_sha" ]; then
      echo "[verify-renovate-prs] PR #$pr_number: verify passed but produced no commit (hash already matched?), skipping."
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      continue
    fi

    if is_in_push_blackout; then
      echo "[verify-renovate-prs] PR #$pr_number: verified, but within the push blackout - leaving unpushed for tonight."
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      continue
    fi

    # --- lm-verify-runner: export just the new commit(s) as a result bundle ---
    # Written into the runner's own workdir, not directly into HANDOFF_DIR:
    # HANDOFF_DIR is root-owned mode 700, so lm-verify-runner has no
    # permission to create anything there directly. Root copies it out
    # below, mirroring how the candidate bundle crossed in the other
    # direction.
    result_local="$workdir/result.bundle"
    runuser -u "$RUNNER_USER" -- env WORKDIR="$workdir" OUT="$result_local" BASE_SHA="$before_sha" bash -c '
      set -e
      cd "$WORKDIR"
      git bundle create "$OUT" "$BASE_SHA..HEAD"
    '
    # Same class of risk as the credential staging above, read-side: refuse
    # if the candidate replaced this expected path with a symlink, rather
    # than letting root's cp follow it and copy an arbitrary host file's
    # content into a bundle that gets chown'd to foundry-verify.
    if [ -L "$result_local" ]; then
      echo "[verify-renovate-prs] PR #$pr_number: result path is a symlink, refusing." >&2
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      runuser -u foundry-verify -- gh pr comment "$pr_number" --repo "$REPO" --body \
        "Nightly e2e re-verification produced an unexpected result path and was not pushed - needs a manual look." \
        || true
      continue
    fi
    cp "$result_local" "$in_bundle"
    chown foundry-verify:foundry-verify "$in_bundle"
    runuser -u "$RUNNER_USER" -- rm -rf "$workdir"

    # --- Back to foundry-verify: validate, pull the verified commit in, push ---
    # FV_DIR was never touched by lm-verify-runner, so running git here
    # carries none of the hook-hijack risk a shared checkout would. The
    # bundle's CONTENT still came from an untrusted identity though - a
    # compromised dependency could have created extra commits during phase
    # A or B - so refuse to merge unless it's exactly the one expected
    # .e2e-verification-only commit, before trusting it with a real push.
    merge_status=0
    runuser -u foundry-verify -- env FV_DIR="$FV_DIR" BUNDLE="$in_bundle" BRANCH="$branch" BASE_SHA="$before_sha" bash -c '
      set -e
      cd "$FV_DIR"
      git checkout -f -B "$BRANCH" "$BASE_SHA"
      git fetch "$BUNDLE" "HEAD:refs/heads/__lm_verified"
      commit_count=$(git rev-list --count "$BASE_SHA..__lm_verified")
      if [ "$commit_count" -ne 1 ]; then
        echo "Refusing to merge: expected exactly 1 new commit, got $commit_count" >&2
        git branch -D __lm_verified
        exit 1
      fi
      changed_files=$(git diff --name-only "$BASE_SHA" __lm_verified)
      if [ "$changed_files" != ".e2e-verification" ]; then
        echo "Refusing to merge: expected only .e2e-verification to change, got: $changed_files" >&2
        git branch -D __lm_verified
        exit 1
      fi
      git merge --ff-only __lm_verified
      git branch -D __lm_verified
    ' || merge_status=$?
    rm -f "$in_bundle"

    if [ "$merge_status" -ne 0 ]; then
      echo "[verify-renovate-prs] PR #$pr_number: result bundle failed validation, refusing to push."
      runuser -u foundry-verify -- gh pr comment "$pr_number" --repo "$REPO" --body \
        "Nightly e2e re-verification produced unexpected commit content and was not pushed - needs a manual look." \
        || true
      continue
    fi

    if ! runuser -u foundry-verify -- git -C "$FV_DIR" push origin "HEAD:$branch"; then
      echo "[verify-renovate-prs] PR #$pr_number: push rejected (branch moved under us, likely a Renovate rebase) - skipping, will retry next run."
      continue
    fi

    if ! runuser -u foundry-verify -- gh pr merge "$pr_number" --repo "$REPO" --auto --squash --delete-branch; then
      echo "[verify-renovate-prs] PR #$pr_number: verified and pushed, but enabling auto-merge failed."
      runuser -u foundry-verify -- gh pr comment "$pr_number" --repo "$REPO" --body \
        "e2e re-verification passed and the hash was pushed, but enabling auto-merge failed - needs a manual \`gh pr merge\`." \
        || true
      continue
    fi

    runuser -u foundry-verify -- env FV_DIR="$FV_DIR" bash -c 'cd "$FV_DIR" && git checkout -f main'

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
stuck_green=$(runuser -u foundry-verify -- gh pr list --repo "$REPO" --author "app/renovate" --state open \
  --json number,mergeable,autoMergeRequest,statusCheckRollup --jq '
    .[] | select(.mergeable == "MERGEABLE") | select(.autoMergeRequest == null) |
    select([.statusCheckRollup[] | select(.name == "test") | .conclusion] == ["SUCCESS"]) |
    select([.statusCheckRollup[] | select(.name == "check-e2e") | .conclusion] == ["SUCCESS"]) |
    .number
  ')
for pr_number in $stuck_green; do
  echo "[verify-renovate-prs] PR #$pr_number: already green but auto-merge not enabled, retrying."
  runuser -u foundry-verify -- gh pr merge "$pr_number" --repo "$REPO" --auto --squash --delete-branch ||
    echo "[verify-renovate-prs] PR #$pr_number: retry also failed, will try again next run."
done

exit 0
