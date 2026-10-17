#!/usr/bin/env bash
# Shrink a bloated local clone of this repo — see docs/LOCAL_CLONE_STORAGE.md.
#
# Clones made before Oct 2026 hold ~14 GiB of old gh-pages (Allure report)
# history in .git. This stops fetching gh-pages, drops that history and
# garbage-collects. Safe to re-run; it refuses to touch anything that could
# lose work (commits on no remote branch, stash entries).
#
#   bash scripts/slim-clone.sh --check   # report only, change nothing
#   bash scripts/slim-clone.sh           # check, then clean
set -euo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

cd "$(git rev-parse --show-toplevel)"

if ! git remote get-url origin 2>/dev/null | grep -qi 'restaunax/automation'; then
  echo "✗ origin is not Restaunax/Automation — run this inside the Automation repo." >&2
  exit 1
fi

echo "Before: .git is $(du -sh .git | cut -f1)"

echo "→ Fetching origin (gh-pages excluded)…"
if [ "$CHECK_ONLY" = 0 ]; then
  git config --unset-all remote.origin.fetch || true
  git config --add remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
  git config --add remote.origin.fetch '^refs/heads/gh-pages'
  git fetch origin --prune
else
  git fetch origin --prune --no-write-fetch-head \
    '+refs/heads/*:refs/remotes/origin/*' '^refs/heads/gh-pages'
fi

# ── Safety checks: anything only this machine has must be pushed first ──
blocked=0

unpushed=""
for b in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  [ "$b" = "gh-pages" ] && continue # report branch, never needed locally
  n=$(git rev-list --count "$b" --not --remotes)
  [ "$n" -gt 0 ] && unpushed="$unpushed\n    $b ($n commit(s) not on GitHub)"
done
if ! git symbolic-ref -q HEAD >/dev/null; then
  n=$(git rev-list --count HEAD --not --remotes)
  [ "$n" -gt 0 ] && unpushed="$unpushed\n    detached HEAD ($n commit(s) not on GitHub)"
fi
if [ -n "$unpushed" ]; then
  echo -e "✗ Local work not on GitHub — push it (or delete the branch if it's junk):$unpushed"
  blocked=1
fi

# Expiring reflogs drops every stash entry except the newest, so require none.
if [ -n "$(git stash list)" ]; then
  echo "✗ You have stash entries (git stash list). Apply/commit them or 'git stash clear' first."
  blocked=1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "  (note) uncommitted changes in the working tree are left untouched."
fi

if [ "$blocked" = 1 ]; then
  echo "Nothing was deleted. Fix the items above and re-run."
  exit 1
fi

if [ "$CHECK_ONLY" = 1 ]; then
  echo "✓ Safe to clean. Run without --check to do it."
  exit 0
fi

# ── Cleanup ──
echo "→ Dropping gh-pages refs and old history…"
git show-ref -q --verify refs/remotes/origin/gh-pages && git branch -dr origin/gh-pages
git show-ref -q --verify refs/heads/gh-pages && git branch -D gh-pages
git reflog expire --expire=now --all
echo "→ Garbage-collecting (can take a few minutes on a 14 GiB .git)…"
git gc --prune=now --quiet

echo "✓ After: .git is $(du -sh .git | cut -f1)"
