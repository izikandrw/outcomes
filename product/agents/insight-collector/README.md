# Insight collector agent

Reads customer evidence where it already lives (spreadsheets, CSV exports, Attention calls, Jira, …), pulls out insights, suggests which outcomes and projects they support, and puts them in a review queue as **unvalidated** until a person approves them.

| doc | what's in it |
| --- | --- |
| [`spec.md`](spec.md) | The customer job, what it must never do, scope, insight lifecycle, data sources, success measures |
| [`design.md`](design.md) | Pipeline, data model and API changes, v0 vs v1, model choice, safety, observability |
| [`evals.md`](evals.md) | How we know it works: metrics, gold cases, the runner, the improvement loop |

## Concepts used in these docs

| term | meaning here |
| --- | --- |
| **Agent** | Software where an LLM makes judgment calls inside a larger process. The spectrum runs from a single call, to a *workflow* (code decides the steps), to an *autonomous agent* (the model picks its own next step, using tools). |
| **Workflow** | Fixed steps, some of which are LLM calls. v1 of this agent is one. See `design.md` §1 for why. |
| **Tool** | A function the model may ask your code to run (e.g. `create_insight`). Tools give a model abilities, and every ability is also a risk. |
| **MCP** | A standard way to expose tools to any agent. Our `mcp/` server already exposes the outcomes API, and v0 adds insight tools to it. |
| **Skill** | A packaged set of instructions Claude Code loads for a task. v0's extraction rules live in one. |
| **Structured outputs** | Forcing the model's response to match a JSON schema, so code can use it without parsing. |
| **Verification in code** | Checking model output mechanically (the quote really exists, the id is real) instead of asking the model to be careful. |
| **Human in the loop** | A person approves before anything counts. Here: the `unvalidated` status and the review queue. |
| **Least privilege** | The agent's credentials allow only its job: create unvalidated insights, read the catalog. |
| **Prompt injection** | Instructions hidden in content the agent reads ("ignore previous instructions…"). Customer text is untrusted data. |
| **Eval** | A fixed set of inputs with known answers, plus scoring code. The test suite for LLM behavior. |
| **LLM judge** | A model grading another model's output against a rubric. Only trusted after checking it agrees with you. |
| **Trace** | A log of what every step saw and produced for every document. This is how you debug an agent. |
| **Prompt caching** | Reusing the processed form of a repeated prompt prefix (instructions, outcome catalog) at a fraction of the cost. |

## Build plan

Each milestone produces something usable and teaches one idea.

| # | milestone | done when | what you learn |
| --- | --- | --- | --- |
| 1 | **Label the first eval set.** 30 real documents from your sheets, Attention and Jira, labeled by hand (`evals.md`). | 30 cases with `expected.json`; insight definition updated where you and a second labeler disagreed | What "good" means, precisely enough for a machine to check it |
| 2 | **Data model + review queue.** `status`, provenance, link status, `collection_runs`; validate/reject endpoints; queue page; evidence counts filter to validated. | You can create an unvalidated insight by hand and approve or reject it in the UI | Human in the loop as product, not afterthought |
| 3 | **v0 in Claude Code.** Insight tools on the MCP server + a `collect-insights` skill; run it on a CSV and a few Jira issues. | Real suggestions are in your queue; you've reviewed them | What an agent loop looks like from the inside; how prompts change behavior |
| 4 | **v1 pipeline + eval runner.** `agent/` with the CSV connector, extract → verify → dedupe → link → write, and `npm run eval`. | Eval passes the ship gates on the test split | Workflows, structured outputs, verification in code, eval-driven iteration |
| 5 | **Attention and Jira connectors.** Incremental cursors, scheduled runs. | A nightly run fills the queue with nothing duplicated | Connectors, idempotency, cost tracking |
| 6 | **Feedback loop.** Weekly: rejections and edits → new eval cases → prompt improvements. | Production approval rate ≥ 70% and rising | Agents improve through data, not one-off cleverness |

Milestones 1 and 2 can run in parallel. Don't skip 1: it's what lets you tell whether 3 and 4 are any good.
