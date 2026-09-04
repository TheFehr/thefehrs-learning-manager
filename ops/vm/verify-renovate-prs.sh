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
# that could push, merge, or forge commits as foundry-verify. Both phases
# it runs (build, then the credentialed e2e run) execute as a transient
# systemd scope with KillMode=control-group rather than plain `runuser`,
# so a lifecycle script that tries to detach and linger past its phase -
# to still be running (same UID) once the next phase stages credentials -
# gets killed with everything else in that cgroup when the phase ends,
# regardless of how it tried to escape its process group.
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
# 711, not 700: directory traversal is checked independently of a file's
# own ownership at every path component, so even after root chowns a
# bundle inside here to whichever identity needs it, that identity still
# couldn't open it through a 700 (root-only, no-traverse) directory.
# --x for group/other allows traversal to an exact, known filename without
# granting listing (no r) or write (no w) - neither identity can create,
# rename, or enumerate entries here, only root can; each individual
# bundle's own permissions (set via chown below) remain the real
# per-file access control.
chmod 711 "$HANDOFF_DIR"

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
# node_modules), $creds_dir (the disposable Foundry credential copy), and
# $fv_bundle (foundry-verify's own scratch bundle, written outside
# HANDOFF_DIR before being copied in - see the candidate-bundle-creation
# comment below for why) if any is in flight. The main loop already
# removes all three at every relevant point, but a crash under `set -e`
# mid-phase, or a TimeoutStartSec kill, would otherwise skip them -
# leaking disk (eventually trips the guard below) and, more seriously for
# $creds_dir, leaving a real credential copy sitting on disk indefinitely.
# Single-quoted so all three are read at trap-fire time, not when the trap
# is registered.
#
# Runs via EXIT trap rather than as a last step so all of this still fires
# if an earlier command aborts the script under `set -e`.
trap '
  runuser -u "$RUNNER_USER" -- podman system prune -f >/dev/null 2>&1 || true
  rm -f "$HANDOFF_DIR"/*.bundle 2>/dev/null || true
  if [ -n "${fv_bundle:-}" ]; then
    # root, not runuser -u foundry-verify: root bypasses both the file
    # owner check and /tmp'"'"'s sticky bit for unlink, so a plain rm here
    # works regardless of whose mktemp created it - same as the
    # HANDOFF_DIR bundle cleanup just above.
    rm -f "$fv_bundle" 2>/dev/null || true
  fi
  if [ -n "${workdir:-}" ]; then
    runuser -u "$RUNNER_USER" -- rm -rf "$workdir" 2>/dev/null || true
  fi
  if [ -n "${creds_dir:-}" ]; then
    # Only shred a genuine regular file, never follow a symlink here
    # (shred, like most tools, dereferences by default) - the 750/640
    # permissions set above already stop lm-verify-runner from replacing
    # this path with one, but this is a cheap second layer. rm -rf does
    # not dereference on removal, so it needs no such guard.
    if [ -n "${creds_file:-}" ] && [ -f "$creds_file" ] && [ ! -L "$creds_file" ]; then
      shred -u "$creds_file" 2>/dev/null || true
    fi
    rm -rf "$creds_dir" 2>/dev/null || true
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

# Force-removes any lingering foundry-playwright-* container before we
# delete $workdir. Defense in depth for a real failure mode hit while
# testing this automation: a container whose /data is a bind mount into
# $workdir survives an npm/orchestrator error path more often than it
# should (e.g. https://github.com/TheFehr/foundry-playwright/pull/92 -
# process.exit() skipping cleanup on failure, since fixed upstream), and
# deleting $workdir out from under a still-running container leaves it
# with a dangling "/deleted" mount rather than actually freeing anything.
# Best-effort: never let a cleanup step abort the script via set -e.
force_remove_foundry_containers() {
  runuser -u "$RUNNER_USER" -- bash -c '
    podman ps -aq --filter "name=foundry-playwright-" | xargs -r podman rm -f
  ' >/dev/null 2>&1 || true
}

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
    # unlike handing over a live .git directory would. Written into
    # foundry-verify's own scratch file first, not directly into
    # $out_bundle: HANDOFF_DIR only grants traversal (711), not write, to
    # non-root - foundry-verify, like lm-verify-runner, has no permission
    # to create anything there directly. Root copies it in below, the same
    # pattern already used for the result bundle in the other direction.
    fv_bundle=$(runuser -u foundry-verify -- mktemp)
    runuser -u foundry-verify -- env FV_DIR="$FV_DIR" BRANCH="$branch" OUT="$fv_bundle" bash -c '
      set -e
      cd "$FV_DIR"
      git fetch origin "$BRANCH"
      git branch -f verify-candidate "origin/$BRANCH"
      git bundle create "$OUT" verify-candidate
    '
    before_sha=$(runuser -u foundry-verify -- git -C "$FV_DIR" rev-parse "origin/$branch")
    cp "$fv_bundle" "$out_bundle"
    chown "$RUNNER_USER:$RUNNER_USER" "$out_bundle"
    runuser -u foundry-verify -- rm -f "$fv_bundle"

    # --- lm-verify-runner, phase A: clone, checkout, build - NO credentials ---
    # Everything that executes candidate-branch code happens here, under an
    # identity with no gh token, no SSH key, and no filesystem access to
    # FV_DIR or foundry-verify's $HOME at all - not via a shared .git, not
    # via anything else. Values are passed via `--setenv` rather than
    # interpolated into the script text, so a branch name can't inject
    # anything into the command run as this identity. Deliberately no
    # Foundry credentials anywhere in this phase: npm ci and generate-types
    # run dependency lifecycle scripts, and this identity has nothing worth
    # stealing until phase B explicitly stages a disposable copy.
    #
    # Run as a transient systemd scope (KillMode=control-group), not plain
    # runuser: a compromised dependency's lifecycle script could double-fork
    # or setsid to detach and keep running as this UID after this phase
    # returns, then read phase B's staged credentials once they exist -
    # temporal separation alone only stops code that runs synchronously and
    # exits. A daemonizing process escapes its process group (reparented to
    # PID 1) but not the cgroup it started in; systemd kills every process
    # still in that cgroup when the unit is done, closing that off
    # regardless of how it tried to detach.
    workdir=$(runuser -u "$RUNNER_USER" -- mktemp -d)
    status=0
    # --user -M "$RUNNER_USER@", not --uid=/--gid=: dispatching to the root
    # *system* manager via --uid= leaves /proc/self/loginuid unset for the
    # spawned process, which breaks rootless Podman's --userns=keep-id
    # identity-mapping of the invoking UID (verified directly on this VM -
    # it produced a bogus 0:997 mapping instead of identity-mapping 997).
    # Routing through lm-verify-runner's own (lingering - see
    # lm-verify-renovate.service's setup notes) user manager instance
    # instead gives the transient scope a real loginuid matching the
    # runner's actual UID, and keep-id maps correctly. Confirmed
    # KillMode=control-group still reaps a detached/disowned process under
    # this form the same as under --uid=.
    systemd-run --user -M "${RUNNER_USER}@" --pipe --wait --collect \
      --property=KillMode=control-group \
      --setenv=WORKDIR="$workdir" --setenv=BUNDLE="$out_bundle" --setenv=BASE_SHA="$before_sha" \
      bash -c '
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
      # $workdir: phase A is candidate-controlled, and a fixed path there
      # could have been pre-planted as a symlink to an arbitrary host file.
      # Root's cp/chown would then follow it - cp writing credential
      # content to whatever it points at, chown (no -h) handing ownership
      # of that arbitrary file to lm-verify-runner. mktemp -d creates an
      # unpredictable path atomically, and since phase A ran as a
      # KillMode=control-group scope above, its entire process tree -
      # including anything that tried to detach and linger - is guaranteed
      # gone by the time this runs, not just "probably exited".
      #
      # Deliberately kept root-owned, read-only for lm-verify-runner - never
      # `chown`'d to it. Phase B only needs to read this file (via `. `),
      # never write it; if it had write access to the file or its
      # containing directory, it could replace $creds_file with a symlink
      # to an arbitrary host path before the cleanup below runs, and that
      # cleanup - running as root - would follow it. 750 (group r-x) on the
      # directory, group-owned by lm-verify-runner's own group, so only it
      # (not every local user) can traverse in and list the one entry;
      # actual content access is still gated by the file's own 640 below.
      creds_dir=$(mktemp -d)
      creds_file="$creds_dir/env"
      cp "$FOUNDRY_ENV_SOURCE" "$creds_file"
      chown root:"$RUNNER_USER" "$creds_dir"
      chmod 750 "$creds_dir"
      chown root:"$RUNNER_USER" "$creds_file"
      chmod 640 "$creds_file"

      # --- lm-verify-runner, phase B: the actual e2e suite, now credentialed ---
      # Same KillMode=control-group scope as phase A, so nothing here can
      # linger past this phase either - relevant since this is the one
      # phase that actually has the credentials in its environment. Same
      # --user -M form as phase A, for the same loginuid/keep-id reason -
      # this is the phase that actually starts the real Foundry container,
      # so a broken UID mapping here would matter even more.
      systemd-run --user -M "${RUNNER_USER}@" --pipe --wait --collect \
        --property=KillMode=control-group \
        --setenv=WORKDIR="$workdir" --setenv=CREDS="$creds_file" \
        bash -c '
          set -e
          cd "$WORKDIR"
          set -a
          . "$CREDS"
          set +a
          npm run test:e2e:verify
        ' || status=$?
      # Same symlink guard as the EXIT trap - see its comment.
      if [ -f "$creds_file" ] && [ ! -L "$creds_file" ]; then
        shred -u "$creds_file" 2>/dev/null || true
      fi
      rm -rf "$creds_dir"
    fi

    if [ "$status" -ne 0 ]; then
      echo "[verify-renovate-prs] PR #$pr_number: verify failed (status $status), leaving branch alone."
      runuser -u foundry-verify -- gh pr comment "$pr_number" --repo "$REPO" --body \
        "Nightly e2e re-verification failed for this update (exit $status). Needs a manual look before it can merge - see the VM's verify-renovate-prs log for details." \
        || true
      force_remove_foundry_containers
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      continue
    fi

    runner_head=$(runuser -u "$RUNNER_USER" -- git -C "$workdir" rev-parse HEAD)
    if [ "$runner_head" = "$before_sha" ]; then
      echo "[verify-renovate-prs] PR #$pr_number: verify passed but produced no commit (hash already matched?), skipping."
      force_remove_foundry_containers
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      continue
    fi

    if is_in_push_blackout; then
      echo "[verify-renovate-prs] PR #$pr_number: verified, but within the push blackout - leaving unpushed for tonight."
      force_remove_foundry_containers
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      continue
    fi

    # --- lm-verify-runner: export just the new commit(s) as a result bundle ---
    # Written into the runner's own workdir, not directly into HANDOFF_DIR:
    # HANDOFF_DIR only grants traversal (711), not write, to non-root, so
    # lm-verify-runner has no permission to create anything there directly.
    # Root copies it out below, mirroring how the candidate bundle crossed
    # in the other direction.
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
      force_remove_foundry_containers
      runuser -u "$RUNNER_USER" -- rm -rf "$workdir"
      runuser -u foundry-verify -- gh pr comment "$pr_number" --repo "$REPO" --body \
        "Nightly e2e re-verification produced an unexpected result path and was not pushed - needs a manual look." \
        || true
      continue
    fi
    cp "$result_local" "$in_bundle"
    chown foundry-verify:foundry-verify "$in_bundle"
    force_remove_foundry_containers
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
#
# Same one-merge-per-run limit as the main loop, for the same reason: a
# merge changes package-lock.json on main, which makes Renovate rebase
# every other open PR - enabling auto-merge on a second one in the same run
# risks it merging against a base that's about to be invalidated.
stuck_green=$(runuser -u foundry-verify -- gh pr list --repo "$REPO" --author "app/renovate" --state open \
  --json number,mergeable,autoMergeRequest,statusCheckRollup --jq '
    .[] | select(.mergeable == "MERGEABLE") | select(.autoMergeRequest == null) |
    select([.statusCheckRollup[] | select(.name == "test") | .conclusion] == ["SUCCESS"]) |
    select([.statusCheckRollup[] | select(.name == "check-e2e") | .conclusion] == ["SUCCESS"]) |
    .number
  ')
for pr_number in $stuck_green; do
  echo "[verify-renovate-prs] PR #$pr_number: already green but auto-merge not enabled, retrying."
  if runuser -u foundry-verify -- gh pr merge "$pr_number" --repo "$REPO" --auto --squash --delete-branch; then
    break
  fi
  echo "[verify-renovate-prs] PR #$pr_number: retry also failed, will try again next run."
done

exit 0
