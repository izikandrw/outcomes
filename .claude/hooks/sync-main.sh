#!/usr/bin/env bash
# Fast-forwards the main checkout (the one that owns .git, not a worktree) to
# origin/main, so new sessions there load the latest skills and CLAUDE.md.
# Run by the SessionStart hook and after each deploy push (.claude/settings.json).
# Only fast-forwards, and only while that checkout is on main; local edits are
# left alone. Silent on success; prints a systemMessage when it can't update.
set -uo pipefail

fail() {
  jq -n --arg m "Couldn't update the main checkout to origin/main: $1" '{systemMessage: $m}'
  exit 0
}

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
cd "$(dirname "$common")" || exit 0
[ "$(git branch --show-current)" = main ] || exit 0

out=$(git fetch -q origin main 2>&1) || fail "$out"
out=$(git merge -q --ff-only origin/main 2>&1) || fail "$out"
