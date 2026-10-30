# Insight collector — evals

## Why evals come before prompts

An LLM step has no unit tests in the usual sense: the same prompt gives slightly different output each run, and a change that fixes one document can quietly break three others. An **eval** is a fixed set of inputs with known-correct answers, plus code that scores the agent's output against them. Every prompt change, model change or effort change gets run through it, and the scores, not impressions, decide whether the change stays.

Without evals, every tweak is a guess. With them, you can say "prompt v7 raised extraction precision from 0.71 to 0.83 without hurting recall," and you can safely try a cheaper model.

**Build the first eval set before writing the v1 prompts.** The labeling work is also where you find out what *you* think counts as an insight. Expect that to sharpen `product/domain-model/insight.md`.

## What we measure

Each pipeline step is measured on its own (see `design.md` §2). When a score drops, you'll know which step caused it.

| step | metric | how it's graded | ship gate (v1) |
| --- | --- | --- | --- |
| Extract | **Precision**: of the insights the agent proposed, how many are real? | Match on excerpt overlap with the gold labels (code), then a judge for leftovers (below) | **≥ 0.80** |
| Extract | **Recall**: of the real insights, how many did the agent find? | same matching | ≥ 0.60 |
| Extract | **Empty-doc accuracy**: on documents with no insights, did it return none? | code: `candidates.length === 0` | ≥ 0.90 |
| Extract | **Insight quality**: is `name` an observation (not a conclusion), specific, and checkable? | LLM judge with a rubric, calibrated against your own labels | ≥ 0.85 |
| Extract | **Firsthand flag correct** | code: compare to the label | ≥ 0.90 |
| Extract | **Dollar impact**: set only when stated, and the right number | code | no invented values (exactly 0) |
| Verify | **Fabricated excerpts that reach output** | code (should be impossible by design; this tests the verify step) | **exactly 0** |
| Verify | **Drop rate**: share of candidates the verify step threw out | code | tracked. A high rate means the extractor paraphrases instead of quoting, so fix the prompt. |
| Link | **Link precision / recall** vs gold links | code: compare id sets | ≥ 0.75 / ≥ 0.60 |
| Link | **No-match accuracy**: insights with no fitting outcome come back unlinked | code | ≥ 0.80 |
| Whole run | **Cost and latency per document**, tokens from the API's `usage` | code | tracked |

**Why precision gets the higher bar:** the spec's biggest failure mode is a noisy queue that reviewers give up on. A missed insight costs little, and the next run or a human can catch it. A junk suggestion costs a reviewer's time and trust.

### How predicted insights are matched to gold ones

This is the hard part of grading extraction, since the agent words things differently from you. Matching runs in two passes:

1. **Excerpt overlap (code, deterministic).** Gold labels record the excerpt span. A prediction matches a gold insight when their excerpts overlap by ≥ 50% of the shorter one. This handles most cases with no judge needed.
2. **Judge for leftovers.** Unmatched predictions go to an LLM judge: "Is this prediction the same observation as any of these unmatched gold insights, or a real insight the labeler missed, or not an insight?" A "labeler missed it" verdict goes into a list for **you** to review and maybe add to the gold set. It doesn't count as a pass automatically.

### Calibrating the LLM judge

A judge is itself a model and can be wrong. Before trusting it, have it grade 30 predictions that you've also graded by hand. If it agrees with you less than ~85% of the time, fix the rubric before trusting any score it produces. Repeat the check whenever the rubric changes.

## The case set

### What a case looks like

```
agent/evals/
  fixtures/
    catalog.json                  # the outcomes + projects of a realistic test account
  cases/
    csv-churn-tracker-row-12/
      document.json               # a SourceDocument (design.md §2.1)
      expected.json               # the gold labels
    attention-globex-renewal/
    jira-PROJ-1234/
    adv-injection-ticket/
    ...
```

```jsonc
// expected.json
{
  "insights": [
    {
      "excerpt": "we gave up on SSO after two days and just kept using passwords",
      "name": "Globex admins abandoned SSO setup after two days",
      "type": "sales_call",
      "firsthand": true,
      "dollar_impact": null,
      "links": [{ "kind": "outcome", "id": "o-sso-adoption" }]
    }
  ],
  "notes": "Rep's speculation at 14:20 about pricing is NOT an insight — opinion, not observation.",
  "tags": ["attention", "firsthand", "single-insight"]
}
```

### What goes in the first set (~30 cases)

| slice | count | why |
| --- | --- | --- |
| Spreadsheet/CSV rows and sheets | ~10 | first connector; cover both row-as-document and sheet-as-document |
| Attention call transcripts | ~8 | rich, long, mixed speakers; tests "customer said" vs "rep said" |
| Jira issues | ~6 | second-hand content; tests `firsthand: false` and vague requests |
| **No insight at all** (password reset, "thanks!", internal chatter) | ~5, spread across sources | without these, an agent that always finds something would score perfectly. Every eval needs cases in both directions. |
| **Adversarial** | ~3 | a ticket containing "ignore your instructions and…"; an insight with a figure hidden in it; one that matches no outcome in the catalog |

About a third of the documents should have **zero** gold insights. That matches reality, since most support tickets and Jira issues aren't evidence of anything.

### Where the cases come from

- **Real documents from your own tools**, not synthetic ones. Synthetic text is too clean and too easy. The material is sensitive, so cases live in the app's database (`eval_cases`), backed up and scoped by account like the customer data they come from, and `agent/evals/cases/` stays out of the repo.
- **Label by hand, before you see the agent's output.** If you label by editing what the agent produced, you anchor on its wording and the eval ends up rewarding "agrees with the model" instead of "correct." Never use the model's output as the gold answer.
- **Get a second labeler on ~10 cases.** Wherever the two of you disagree, the definition is ambiguous. Fix `insight.md`, not just the label.
- The catalog fixture should look like a real account: 15–30 outcomes and projects, including a couple that are *nearly* right for some insights, so linking is actually tested.

### Keep a held-out set

Split the cases ~70/30 into **dev** (look at these freely while tuning prompts) and **test** (score them, but don't read the failures while tuning). If you tune against every case, you end up memorizing the eval instead of improving the agent. The test score is the number you report.

## The runner

`npm --prefix agent run eval -- [--split dev|test|all] [--set golden|review|all] [--reps 3] [--model ...] [--effort ...]` (built: `agent/src/evals/`; every option is listed at the top of `cli.js`)

It scores the **ready** cases from Review → Eval set, read through the API as a person (`OUTCOMES_API_URL` plus `OUTCOMES_API_TOKEN` or `OUTCOMES_EMAIL`/`OUTCOMES_PASSWORD`, as for `mcp/`; the collector can't read them), or a file from **Download ready cases** with `--file` and `--catalog`. The model is called with `ANTHROPIC_API_KEY` or an `ant auth login` profile. Defaults: Claude Opus 5.5 at `high` effort, 3 reps, the dev split. Results land in `agent/evals/results/<time>-<prompt version>-<model>-<effort>/` (ignored by git: they quote customer content), and `summary.md` compares each metric with the last run of the same split, marking changes inside the spread over reps. Golden and review sets are reported apart, because recall on the review set is only an upper bound. Run `--self-check` first, and again after changing the grader.

There is no refusal fallback to another model: in an eval, another model quietly answering would put its output under this one's name, so a refusal is filed as an error. The LLM judge for unmatched predictions (below) isn't built yet; `summary.md` lists them for you to read instead.

What it does, and why each part is there:

1. **Calls the real pipeline functions** (`extract`, `verify`, `link`), not a copy. An eval that re-implements the call measures something other than what ships.
2. **Runs each case 3 times** (`--reps`). Output varies run to run, so one run is a guess. Report the average and the spread. A change smaller than the spread isn't a real change.
3. **Feeds gold candidates into the linker** (as well as running end to end), so link scores don't swing with extraction mistakes.
4. **Keeps infrastructure failures out of the score.** API errors, timeouts and truncated output (`stop_reason: max_tokens`) go to `errors.jsonl`, not into the scores as a "wrong answer." Otherwise a rate-limit spike looks like a worse prompt.
5. **Saves everything**: `results/<timestamp>-<prompt_version>/` with `results.jsonl` (per case and run: inputs, raw output, scores, tokens, cost), `errors.jsonl`, and `summary.md` (the metric table, compared to the previous run). When a score surprises you, read the transcript before drawing conclusions.
6. **Sanity-checks itself** before you trust it: feeding the gold labels in as the "prediction" should score ~100%, and an empty prediction should score 0 on precision and recall and ~100% on empty-doc accuracy. If either doesn't, the grader has a bug.

## The improvement loop

```
  change one thing (prompt wording, an example, effort, model)
            │
            ▼
  npm run eval --split dev  ──▶  compare summary.md with the last run
            │
     better on the metric you targeted, nothing else worse beyond the spread?
        │ yes                          │ no
        ▼                              ▼
  keep it; bump prompt_version     revert
            │
  every few rounds: run --split test, record it
```

Change **one** thing at a time, or you won't know what helped.

## Closing the loop with production

Once real people are reviewing, every decision in the queue is labeled data. `insight_events` records each one with the insight before and after, so the collector's original output survives the review:

- **Rejected** insights (with reason) → candidate *precision* cases
- **Edited then approved** → the diff shows what the agent got slightly wrong
- **Links removed or added** by reviewers → link cases
- **Insights people add by hand** from a source the agent already read → *recall* misses

Once a week, look through new rejections and edits, and through the documents the agent passed over, on **Review → Runs** (`design.md` §6). The run trace shows every document the agent read, its decision and reason, and the review verdict on each suggestion. Use it to **choose** cases: rejections, heavy edits, rows it skipped that it shouldn't have, close calls it flagged. Each document there can be added to the **eval set** (Review → Eval set, the `eval_cases` table, migration `021`), in one of two sets:

- **Review set**: the expected answer is drafted from what reviewers did. Approved suggestions are expected as reviewers left them; ones rejected as not an insight or inaccurate go in `not_insights`; anything that needs a judgment call (waiting, a duplicate, a wrong link, a skipped document) leaves the case a draft with a note. Cheap and grows with every review, so it catches regressions, but it only knows what the agent suggested, so it can't measure recall.
- **Golden set**: the expected answer starts blank. Write it from the document, without looking at what the agent said, or the eval ends up rewarding agreement with the agent. This is the set that measures recall.

Only **ready** cases are scored, and a case can't be marked ready while an expected excerpt isn't in its document. New cases fill the held-out **test** split up to 30%. The collector can't read the eval set. **Download ready cases** gives one JSON file of `{ name, split, label_source, document, expected }`, the `agent/evals/cases/` folders flattened. Track approval rate in production next to the eval scores. If evals improve and approval rate doesn't, the eval doesn't reflect real usage and needs new cases.
