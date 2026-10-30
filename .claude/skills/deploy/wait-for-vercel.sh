#!/usr/bin/env bash
# Waits for Vercel's production build of a commit, via the "Vercel" commit
# status that Vercel's GitHub integration posts. Prints "<state> <url>".
# Exit 0 = success, 1 = failure/error, 2 = timed out (no final status).
# Usage: wait-for-vercel.sh <sha> [timeout-seconds, default 900]
set -euo pipefail

sha=$1
timeout=${2:-900}
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
deadline=$((SECONDS + timeout))

while :; do
  line=$(gh api "repos/$repo/commits/$sha/statuses" \
    --jq 'first(.[] | select(.context == "Vercel") | "\(.state) \(.target_url)") // empty' 2>/dev/null || true)
  state=${line%% *}
  case $state in
    success) echo "$line"; exit 0 ;;
    failure|error) echo "$line"; exit 1 ;;
  esac
  if ((SECONDS >= deadline)); then echo "timeout ${line:-no Vercel status yet}"; exit 2; fi
  sleep 10
done
