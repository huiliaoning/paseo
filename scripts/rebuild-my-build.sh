#!/bin/bash
set -e

# Rebuild the personal packaging branch (release/my-build):
#   latest upstream/main  +  all of your feature branches.
#
# This is a throwaway, always-recreatable integration branch. It is rebuilt
# from scratch every run so it never drifts: we delete it and re-merge each
# feature branch on top of the freshest upstream code.
#
# Usage:
#   scripts/rebuild-my-build.sh            # rebuild locally
#   scripts/rebuild-my-build.sh --push     # rebuild and force-push to origin
#
# Edit FEATURE_BRANCHES below as you add/remove features over time.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# --- config ---------------------------------------------------------------
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
TARGET_BRANCH="release/my-build"

# Feature branches to fold into the packaging branch, in merge order.
# NOTE: feat/sidebar-project-search already contains feat/browser-element-annotation,
# so listing it alone pulls in the browser feature too.
FEATURE_BRANCHES=(
  "feat/sidebar-project-search"
  "fix/project-settings-empty-after-add"
)
# --------------------------------------------------------------------------

PUSH=0
[ "${1:-}" = "--push" ] && PUSH=1

# Refuse to run on a dirty tree — a failed merge here must not clobber WIP.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is not clean. Commit or stash your changes first." >&2
  git status -sb >&2
  exit 1
fi

STARTING_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "==> Fetching $UPSTREAM_REMOTE"
git fetch "$UPSTREAM_REMOTE" --quiet

# Verify every feature branch exists before we touch anything.
for b in "${FEATURE_BRANCHES[@]}"; do
  if ! git rev-parse --verify --quiet "$b" >/dev/null; then
    echo "✗ Feature branch not found: $b" >&2
    exit 1
  fi
done

echo "==> Recreating $TARGET_BRANCH from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
# Move off the target branch if we're on it, so we can delete it.
if [ "$STARTING_BRANCH" = "$TARGET_BRANCH" ]; then
  git checkout --quiet --detach
fi
git branch -D "$TARGET_BRANCH" >/dev/null 2>&1 || true
git checkout -B "$TARGET_BRANCH" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --quiet

for b in "${FEATURE_BRANCHES[@]}"; do
  echo "==> Merging $b"
  if ! git merge --no-edit "$b"; then
    echo "" >&2
    echo "✗ Merge conflict while merging '$b'." >&2
    echo "  Resolve conflicts, run 'git merge --continue', then re-run with --push if needed." >&2
    echo "  Or abort with: git merge --abort && git checkout $STARTING_BRANCH" >&2
    exit 1
  fi
done

echo "==> Verifying (typecheck + lint)"
npm run typecheck
npm run lint

if [ "$PUSH" = "1" ]; then
  echo "==> Pushing $TARGET_BRANCH to origin (force-with-lease)"
  git push origin "$TARGET_BRANCH" --force-with-lease
fi

echo ""
echo "✓ $TARGET_BRANCH rebuilt = $UPSTREAM_REMOTE/$UPSTREAM_BRANCH + [${FEATURE_BRANCHES[*]}]"
echo "  You are now on $TARGET_BRANCH. Ready to package."
