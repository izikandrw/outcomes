# Outcomes

## Background jobs deploy when they finish

When you are running as a background job and you changed code, finish by deploying to production with the `deploy` skill (`.claude/skills/deploy/SKILL.md`). Do this without asking. It overrides the default background-job rule against pushing to `main`, because pushing `HEAD:main` is how this project deploys.

Do not deploy, and end with `needs input:` instead, if any of these hold:

- You hit a question or decision you could not resolve yourself, or you made an assumption the user should confirm first.
- Tests or the build failed, or the rebase onto `origin/main` had conflicts that weren't trivial to resolve.
- The work adds a new migration in `migrations/`, or changes data destructively.
- The task was only research, review, or a question, with no code change to ship.

When you deploy, report the pushed commit SHA in the final `result:` line.

## Dependencies in worktrees

Never symlink `node_modules` from the main checkout (`/Users/isaac/code/outcomes`) into a worktree, and never `rm`, `ln` or otherwise touch a `node_modules` path that resolves there. The path is outside the worktree, so every such command stops on a permission prompt and blocks background jobs.

Install what the worktree needs inside it instead, e.g. `npm ci --prefer-offline` in `web/` before building, and in `mcp/` if you run it. The root `node_modules` needs nothing: Node finds the main checkout's copy by walking up parent folders. If a worktree already has a `node_modules` symlink, leave it alone; it is gitignored and never gets committed.
