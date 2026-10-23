# outcomes MCP server

A stdio [MCP](https://modelcontextprotocol.io) server that exposes the outcomes API to agents. It calls the REST API in `../src`, so auth, account scoping and validation stay in one place.

## Tools

| tool | |
| --- | --- |
| `list_outcomes` | all outcomes in the account |
| `get_outcome` | one outcome by id |
| `create_outcome` | `name`, `team_id`, optional `description`, `project_id`, `parent_outcome_id` |
| `update_outcome` | partial update; unspecified fields are kept |
| `delete_outcome` | delete by id |

New resources (teams, projects, targets…) go in `src/tools/` and are registered in `src/server.js`.

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
