#!/usr/bin/env bash
# Removes Claude Code worktrees (.claude/worktrees/*) whose work has landed, and
# deletes their worktree-* branches. Run by the SessionStart hook after
# sync-main.sh, so origin/main is fresh; also safe to run by hand.
#
# A worktree is removed only when all of these hold:
#   - every commit on it is in origin/main (by patch, so rebased work counts)
#   - it has no uncommitted changes or untracked files (ignored files don't count)
#   - it isn't locked by a process that is still running (a Claude session)
#   - nothing has happened in it for PRUNE_MIN_AGE_HOURS (default 6)
#   - it isn't the worktree this script runs from
#
# Usage: prune-worktrees.sh [--dry-run]   (logs to .git/prune-worktrees.log)
set -uo pipefail

dry_run=0
[ "${1:-}" = --dry-run ] && dry_run=1
min_age=$(( ${PRUNE_MIN_AGE_HOURS:-6} * 3600 ))
now=$(date +%s)
here=$(git rev-parse --show-toplevel 2>/dev/null)

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
root=$(dirname "$common")
cd "$root" || exit 0
log="$common/prune-worktrees.log"

say() {
  echo "$*"
  [ "$dry_run" = 1 ] || echo "$(date '+%F %T') $*" >> "$log"
}

git rev-parse -q --verify origin/main >/dev/null || exit 0
git worktree prune

for dir in "$root"/.claude/worktrees/*/; do
  dir=${dir%/}
  name=$(basename "$dir")
  admin="$common/worktrees/$name"
  [ -d "$admin" ] || continue
  [ "$dir" = "$here" ] && continue

  # Lock files look like "claude session <name> (pid 123 start ...)".
  lock=""
  if [ -f "$admin/locked" ]; then
    pid=$(sed -n 's/.*(pid \([0-9]*\).*/\1/p' "$admin/locked")
    if [ -z "$pid" ]; then say "keep $name: locked ($(cat "$admin/locked"))"; continue; fi
    if kill -0 "$pid" 2>/dev/null; then continue; fi
    lock=stale
  fi

  # logs/HEAD changes on every commit, checkout and reset in the worktree.
  touched=$(stat -f %m "$admin/logs/HEAD" 2>/dev/null || stat -f %m "$admin")
  [ $(( now - touched )) -lt "$min_age" ] && continue

  if [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]; then
    say "keep $name: uncommitted changes"; continue
  fi
  if git cherry origin/main "$(git -C "$dir" rev-parse HEAD)" | grep -q '^+'; then
    say "keep $name: commits not in origin/main"; continue
  fi

  branch=$(git -C "$dir" branch --show-current)
  if [ "$dry_run" = 1 ]; then say "would remove $name${lock:+ (stale lock)}"; continue; fi

  [ -n "$lock" ] && git worktree unlock "$dir"
  if ! out=$(git worktree remove "$dir" 2>&1); then say "keep $name: $out"; continue; fi
  [ "$branch" = "worktree-$name" ] && git branch -q -D "$branch"
  say "removed $name${lock:+ (stale lock)}"
done
