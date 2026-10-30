# outcomes MCP server

A stdio [MCP](https://modelcontextprotocol.io) server that exposes the outcomes API to agents. It calls the REST API in `../src`, so auth, account scoping and validation stay in one place.

## Tools

Every resource has `list_*`, `get_*`, `create_*`, `update_*` and `delete_*`, except measurements (below). The API's PUTs replace the whole record, so `update_*` tools fetch the current record and apply only the fields you pass.

| resource | notes |
| --- | --- |
| account | `get_account` and `update_account` (name, logo) act on the signed-in account; updating needs an admin |
| teams | `logo` on `create_team` / `update_team`; leaving it out of an update keeps the current one |
| impacts | nest via `parent_impact_id` |
| outcomes | `impact_id` only on top-level outcomes; nesting an outcome drops it |
| projects | `outcome_ids` links the outcomes a project drives; passing it on update replaces the set |
| insights | `outcome_ids` / `project_ids` link evidence; passing either on update replaces that set. `list_insights` takes an optional `status`. `create_insight` records evidence a person asked for; `suggest_insight` is the insight collector's: it requires the verbatim excerpt and source reference, takes up to 3 links each with a rationale, and always lands `unvalidated` in the review queue (a duplicate is skipped, not an error) |
| targets | exactly one of `outcome_id` / `impact_id`; `update_target` can't move a target to another parent |
| measurements | `list_measurements` (optionally by `target_id`, oldest first), `record_measurement`, `update_measurement`, `delete_measurement` |

`list_collection_runs` / `get_collection_run` read the insight collector's run traces: every document a run read, its decision and reason, and how its suggestions fared in review.

Logos (`update_account`, `create_team`, `update_team`) take an http(s) URL (a favicon.ico works if it holds PNG images, as most do), a local file path or a data URL; the server downsizes the image to fit 128px and sends it as a PNG data URL, as the web app does. `null` removes the logo.

`review_portfolio` answers "are we working on the right things?" (`product/jtbds/delivery.md`): chimerical impacts, unvalidated outcomes (`min_insights`, default 1), chimerical outcomes and projects with no outcome. Links roll up through nesting.

New resources go in `src/tools/` and are registered in `src/server.js`; `src/tools/shared.js` has the list/get/delete and partial-update helpers.

## The insight collector's toolset

`OUTCOMES_TOOLSET=collector` registers only `list_outcomes`, `get_outcome`, `list_projects`, `get_project`, `list_insights`, `get_insight`, `suggest_insight`, and the run-trace tools `start_collection_run`, `record_document` and `finish_collection_run`: what the insight collector agent (`product/agents/insight-collector/`, skill `.claude/skills/collect-insights/`) needs to read the account and suggest insights. Pair it with the account's `collector` user, which the API holds to the same limits: `npm run collector` creates that user and prints the `claude mcp add outcomes-collector …` command.

## Run

```sh
npm --prefix mcp install
```

Config via env:

| var | |
| --- | --- |
| `OUTCOMES_API_URL` | API origin, default `http://localhost:3000` |
| `OUTCOMES_API_TOKEN` | a session token, **or** |
| `OUTCOMES_EMAIL` / `OUTCOMES_PASSWORD` | sign in with credentials, **or** |
| `OUTCOMES_DEV_LOGIN=true` | local dev only; uses `/auth/dev-login` |

Register with Claude Code (API must be running, e.g. `npm run dev`):

```sh
claude mcp add outcomes -e OUTCOMES_DEV_LOGIN=true -- node "$PWD/mcp/src/server.js"
```
