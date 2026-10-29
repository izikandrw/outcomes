---
name: deploy
description: Commit current work, merge it into main, and push so Render and Vercel auto-deploy. Use when the user says "deploy", "ship it", or asks to release current changes to production.
---

# Deploy

Deploying = getting the current branch's work onto `origin/main`. Pushing to `main` triggers the Render and Vercel deploys automatically; there is nothing else to run.

The repo is a bare repo with per-branch worktrees (no checkout of `main`), so never `git checkout main`. Rebase the current branch onto `origin/main`, then fast-forward `main` with a push. The skill never creates merge commits: history stays linear.

## Steps

1. **Check state.** Run `git status` and `git branch --show-current`. If on `main`, stop and tell the user to work from a branch.
2. **Commit.** If there are uncommitted changes, stage them (by name, not blindly; skip anything that looks like secrets or junk), and commit with a message matching the repo's style (see `git log --oneline -10`). If nothing to commit, continue.
3. **Rebase onto latest main.** `git fetch origin main`, then `git rebase origin/main`. Never use `git merge` (no merge commits, including `--no-ff`). If there are conflicts, resolve them if they are straightforward and `git rebase --continue`; otherwise `git rebase --abort` and ask the user.
4. **Verify.** Run the project's build/tests if they exist in `package.json` (e.g. `npm run build`, `npm test`) and stop on failure. Check `web/` too if it has its own `package.json` scripts.
5. **Push.** `git push origin HEAD:main`. This must be a fast-forward; if it is rejected, go back to step 3. Never force-push. Do not push the working branch itself (a rebase rewrites it, which would need a force-push).
6. **Stop after the push.** Don't check Render or Vercel deploy status; the user checks those themselves.

## Notes

- If a database migration is in `migrations/` and new in this deploy, call it out to the user before pushing, since it ships with the deploy.
- Report outcomes faithfully: say which steps ran, and the pushed commit SHA.
