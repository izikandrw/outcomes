---
name: deploy
description: Commit current work, merge it into main, push so Render and Vercel auto-deploy, and wait until it is live in production. Use when the user says "deploy", "ship it", or asks to release current changes to production.
---

# Deploy

Deploying = getting the current branch's work onto `origin/main`. Pushing to `main` triggers the Render and Vercel deploys automatically; the skill then waits until both serve the new commit.

The repo is a bare repo with per-branch worktrees (no checkout of `main`), so never `git checkout main`. Rebase the current branch onto `origin/main`, then fast-forward `main` with a push. The skill never creates merge commits: history stays linear.

## Steps

1. **Check state.** Run `git status` and `git branch --show-current`. If on `main`, stop and tell the user to work from a branch.
2. **Commit.** If there are uncommitted changes, stage them (by name, not blindly; skip anything that looks like secrets or junk), and commit with a message matching the repo's style (see `git log --oneline -10`). If nothing to commit, continue.
3. **Rebase onto latest main.** `git fetch origin main`, then `git rebase origin/main`. Never use `git merge` (no merge commits, including `--no-ff`). If there are conflicts, resolve them if they are straightforward and `git rebase --continue`; otherwise `git rebase --abort` and ask the user.
4. **Verify.** Run the project's build/tests if they exist in `package.json` (e.g. `npm run build`, `npm test`) and stop on failure. Check `web/` too if it has its own `package.json` scripts; if `web/node_modules` is missing, run `npm ci --prefer-offline` in `web/` first. Never symlink or remove `node_modules` (see CLAUDE.md, "Dependencies in worktrees").
5. **Push.** `git push origin HEAD:main`. This must be a fast-forward; if it is rejected, go back to step 3. Never force-push. Do not push the working branch itself (a rebase rewrites it, which would need a force-push).
6. **Wait for it to land in prod.** Pushing only starts the deploys. Wait until production serves the pushed commit (`git rev-parse HEAD`, below `$SHA`), so the final report tells the user it is ready to verify. Check both platforms and give up after about 15 minutes:
   - **Vercel (frontend).** Run `.claude/skills/deploy/wait-for-vercel.sh $SHA` in the background and check Render while it runs. It polls the `Vercel` commit status on GitHub and prints the state and Vercel deployment link (exit 0 = success, 1 = failed, 2 = timed out).
   - **Render (API).** Call the Render MCP's `list_deploys` with `serviceId` `srv-daoqguegekts73elr93g` (service `outcomes`), `workspaceId` `tea-daoqeq740ujc7389inig` and `limit` 5, and find the deploy whose `commit.id` is `$SHA`. `live` means landed. `created`, `queued` or any `*_in_progress` status means check again in about 30 seconds. `build_failed`, `update_failed` or `pre_deploy_failed` means the deploy failed: get the error with `list_logs` and report it.
   - **Superseded.** Another job may push right after you. If your commit's deploy is `deactivated`, `canceled` or missing, it still landed when the `live` Render deploy (or a successful Vercel build) is for a newer commit that contains yours: check with `git merge-base --is-ancestor $SHA <that commit>` after fetching `origin main`.
   - **Neon (database).** Render runs `npm run migrate` before it starts, so a `live` Render deploy means migrations applied. Only when this deploy ships a new migration, confirm it with the Neon MCP's `run_sql` (`project_id` `solitary-tree-42114435`): `SELECT name, applied_at FROM schema_migrations ORDER BY name DESC LIMIT 3`. Read-only queries only.
7. **Report.** End with a `result:` line that says whether the change is live in prod, so the jobs list shows it at a glance, e.g. `result: Live in prod (Vercel + Render) as abc1234: <what changed>. Ready to verify.` If a platform failed or timed out, name it and say why, and don't call the change live.

## Notes

- If a database migration is in `migrations/` and new in this deploy, call it out to the user before pushing, since it ships with the deploy.
- Report outcomes faithfully: say which steps ran, the pushed commit SHA, and whether each platform is live.
