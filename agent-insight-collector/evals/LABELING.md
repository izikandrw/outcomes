# Labeling eval cases

This is milestone 1 of the insight collector (`product/agents/insight-collector/`). You're writing down the right answer for ~30 real documents, so we can measure the agent against it. See `evals.md` there for why.

## Where cases live

The eval set lives in the app's database, in the `eval_cases` table (migrations `021` and `022`), not in this repo: cases hold real customer content. On **Review → Runs**, open a run and click **Add to golden set** on a document, then label it on **Review → Eval set**, where you can select the excerpt in the document text. `npm run eval` reads the ready cases from the API (`GET /accounts/:id/eval-cases`, signed in as a person; the collector can't read them), or from a file saved with **Download ready cases**. There are no MCP tools for them.

Each case has a `name`, a `split` (`dev` or `test`), a `label_source` (`golden` or `review`), a `status` (only `ready` cases are scored) and three JSON fields:

- `document`: the source document, in the shape every connector produces (`design.md` §2.1): `source_system`, `external_id`, `url`, `title`, `occurred_at`, `customer`, `firsthand`, `metadata`, `text`.
- `expected`: what a careful person would pull out of it: `{ insights: [{ excerpt, name, type, firsthand, dollar_impact, links: [{ kind, id }] }], notes, tags }`.
- `catalog`: the outcomes and projects the case was labelled against, frozen with it, so its expected links keep pointing at the same ids.

Names: `<source>-<what>`, e.g. `csv-churn-tracker-row-12`, `attention-globex-renewal`, `jira-PROD-2291`, `noinsight-password-reset`.

## The mix to aim for (~30)

| | count |
| --- | --- |
| Spreadsheet / CSV (some one row = one doc, some a whole sheet = one doc) | ~10 |
| Attention call transcripts | ~8 |
| Jira issues | ~6 |
| Documents with **no** insight (thanks-notes, password resets, internal chatter) | ~5 |
| Tricky: an "ignore your instructions" line, a buried dollar figure, an insight that fits no outcome | ~3 |

About a third should have an empty `insights` list. That's deliberate.

## How to label one document

1. **Read the document before you've seen any model output.** Label from scratch, or the eval ends up measuring "agrees with the model."
2. For each insight, ask: *is this one specific, checkable observation, and could someone go back and verify it?* (`product/domain-model/insight.md`.) Conclusions ("users hate onboarding"), our own reps' opinions and vague asks are **not** insights. Write why in `notes` when it's a close call.
3. `excerpt`: copy the exact words the insight rests on, character for character. The grader matches on it.
4. `firsthand`: true if the excerpt is the customer's own words or actions, including their words quoted verbatim in a rep's or support agent's notes. A paraphrase or summary ("customer X asked for…") is `false`.
5. `dollar_impact`: only if the document states a number. Otherwise null.
6. `links`: outcome/project ids from the case's `catalog` that this insight is evidence for. Empty is fine.
7. Once 10 cases are labeled, have someone else label the same 10 without looking at yours. Every disagreement means the definition is unclear: fix `insight.md`, then the labels.
