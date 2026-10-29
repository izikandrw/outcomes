# Labeling eval cases

This is milestone 1 of the insight collector (`product/agents/insight-collector/`). You're writing down the right answer for ~30 real documents, so we can measure the agent against it. See `evals.md` there for why.

## One case = one folder

```
agent/evals/cases/<short-name>/
  document.json   # the source document, in the shape every connector produces
  expected.json   # what a careful person would pull out of it
```

Copy `cases/_example-attention-call/` and replace the contents. Folder names: `<source>-<what>`, e.g. `csv-churn-tracker-row-12`, `attention-globex-renewal`, `jira-PROD-2291`, `noinsight-password-reset`.

**Real customer content stays out of git.** Everything in `cases/` is ignored except the example. Keep the folder somewhere private and backed up.

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
6. `links`: outcome/project ids from the eval catalog (`fixtures/catalog.json`, exported from your account when the runner is built) that this insight is evidence for. Empty is fine.
7. Once 10 cases are labeled, have someone else label the same 10 without looking at yours. Every disagreement means the definition is unclear: fix `insight.md`, then the labels.
