# Insight collector — product spec

## The job

> When I'm deciding which outcomes and projects to put resources behind, I want the evidence for each one gathered for me from wherever customers are already talking, so that I can back the right bets without spending days digging through tickets, calls and notes.

Organizations want to drive the most important outcomes (see `../../jtbds/identify-outcomes.md`). To know what's important they need evidence: insights. That evidence already exists, but it's spread across support tools, call recordings, research notes and surveys. Nobody has time to read all of it, so outcomes get prioritized on opinion. In `../../jtbds/delivery.md` terms, that's an **unvalidated outcome**: one with too little evidence behind it.

The insight collector reads those sources and suggests insights, already linked to the outcomes and projects they support. A person makes the final call on every one.

**The raw material lives outside this app**, in spreadsheets, CSV exports, sales-call tools like Attention, Jira, and so on. The agent reads from those tools and never writes back to them. This app stores only the insight the agent pulled out, plus a pointer back to the original (a link, a row number, a call timestamp) so anyone can check it.

### Who hires it

| who | their job | what "done well" looks like |
| --- | --- | --- |
| Product lead / PM | "Show me the evidence for and against what's on my roadmap." | Opens an outcome and sees sourced insights they didn't have to find. |
| Researcher / insights owner | "Get what we learned out of the research repo and in front of the people deciding." | Their findings show up linked to the right outcomes without re-typing them. |
| Leader reviewing the portfolio | "Are we working on the right things?" | Fewer outcomes are flagged as unvalidated, and the ones that remain truly have no evidence. |

### What it must never do

These are the reasons people would *fire* it:

- **Make things up.** Every insight must point to a real passage in a real source. One fabricated quote destroys trust in all the rest.
- **Bury people in noise.** If most suggestions are junk, reviewers stop reviewing and the queue rots. Precision matters more than recall.
- **Pass off conclusions as insights.** "Users hate onboarding" is not an insight. "11 of 14 admins abandoned setup at the SSO step" is (`../../domain-model/insight.md`).
- **Change the record without a human.** Unreviewed suggestions must not count as evidence anywhere: not in outcome evidence counts, not in delivery health views, not in prioritization.
- **Suggest the same thing twice.** That includes things a reviewer already rejected.

## Scope

### In scope (v1)

1. Run against one **source** (see below) for one account, either on demand or on a schedule.
2. Pull out **candidate insights** that meet the domain definition: a single, specific, checkable observation with a source.
3. Suggest **links** from each candidate to existing outcomes and projects, each with a one-line rationale.
4. Save each candidate as an insight with status **`unvalidated`**, with full provenance: source system, link to the original, the verbatim excerpt, and the run that produced it.
5. Give reviewers a **review queue**: approve, edit then approve, or reject (with a reason), at both the insight level and the link level.
6. Skip anything already collected, and anything a reviewer rejected before.

### Out of scope (v1)

- Creating new outcomes or projects. The agent only attaches evidence to things that already exist. When an insight doesn't fit any existing outcome, it can say "unlinked — may suggest a missing outcome," but it doesn't create one.
- Estimating `dollar_impact`. The agent may fill it in only when the source states a number ("$40k ARR account churned"). It never guesses.
- Approving anything automatically, at any confidence level. We can revisit once evals and production approval rates earn it.
- Quantitative sources such as product analytics and funnels (see below).

## Lifecycle of a collected insight

```
             agent run
                 │
                 ▼
          ┌─────────────┐   reviewer approves (optionally edits)   ┌───────────┐
          │ unvalidated │ ───────────────────────────────────────▶ │ validated │
          └─────────────┘                                          └───────────┘
                 │ reviewer rejects (with reason)
                 ▼
          ┌──────────┐
          │ rejected │  kept, not deleted: prevents re-suggesting it, and feeds evals
          └──────────┘
```

- Insights people create by hand are `validated` from the start. Existing rows are backfilled as `validated`.
- Links have their own status, because the agent can be right about the insight but wrong about where it belongs. Approving an insight confirms the links the reviewer left in place. Each link can also be removed individually.
- Editing an insight before approving it counts as approval. We record the edit, since edits are a quality signal.

## Data sources

These are the places customer insights most often live, ranked by how useful they are for v1:

| category | common tools | insight density | maps to `type` | access | v1 priority |
| --- | --- | --- | --- | --- | --- |
| Spreadsheets & CSV | Excel, Google Sheets, CSV exports from any tool below (feedback logs, survey results, churn trackers, interview trackers) | varies by sheet; often high, since someone already curated it | depends on the sheet | file upload; Google Sheets API later | **1st: build and evaluate against this** |
| Sales & CS calls | **Attention**, Gong, Chorus, Fathom, Zoom/Meet/Teams transcripts | high (objections, lost-deal reasons, feature asks, churn risk), and often tied to deal size | needs `sales_call` | Attention has an API and exports; transcripts can also come in as files | **2nd** |
| Issue trackers | **Jira**, Linear (customer-reported bugs, feature-request issues, tickets tagged with customers) | medium; often second-hand ("customer X asked for…") | `support_ticket` / needs `feature_request` | good REST APIs (Jira Cloud: OAuth or API token, JQL filters) | **2nd** |
| Support tickets & chat | Zendesk, Intercom, Freshdesk, Help Scout, Front | medium (high volume, mostly noise) | `support_ticket` | good REST APIs, OAuth | 3rd |
| Research repositories | Dovetail, Condens, EnjoyHQ, Notion, Google Docs, Confluence | very high (already synthesized) | `interview` | varies; Notion/GDocs are easy | 3rd |
| Feedback portals | Productboard, Canny, UserVoice, Aha! Ideas | medium (feature requests, with votes) | needs `feature_request` | good APIs | later |
| Surveys & NPS | Delighted, Qualtrics, Typeform, SurveyMonkey, in-app NPS | medium (free-text comments) | needs `survey` | good APIs and exports | later (or as CSV now) |
| CRM | Salesforce, HubSpot (closed-lost reasons, churn notes) | medium; tied to dollars | `other` | good APIs | later: best source for `dollar_impact` |
| Internal channels | Slack `#customer-feedback`, shared Slack Connect channels | medium | `other` | Slack API | later |
| Public reviews | G2, Capterra, App Store, Google Play | low to medium | needs `review` | scraping or vendor APIs | later |
| Product analytics | Amplitude, Mixpanel, PostHog | high, but quantitative | `funnel`, `experiment` | APIs | **out of v1**: needs a different agent that queries and reasons over numbers, not text |
| Session replay | FullStory, Hotjar, LogRocket | high, but video | `session_recording` | limited | **out of v1** |

**Why spreadsheets and CSV first:** they're the most common place teams already keep feedback. Nearly every other tool can export to CSV, so one importer covers a long tail of sources. It needs no OAuth or connector code, and it lets us build the eval set out of real material (see `evals.md`). Every connector ends up producing the same shape anyway: a list of text documents with metadata.

Spreadsheets do raise one design question that other sources don't: **what counts as one document?** Sometimes one row is one piece of feedback (a survey response). Sometimes a whole sheet is one artifact (an interview synthesis). The importer has to let the person running it say which columns hold the text, which hold metadata (customer, date, link), and whether the unit is a row or the whole sheet.

**Why Attention and Jira next:** they're the tools this team actually uses. Attention calls are among the richest sources there are (a customer explaining in their own words why they will or won't buy), and the deal value attached to them is the most defensible source for `dollar_impact`. Jira has clean APIs and JQL lets us target only customer-related issues. But its content is often second-hand (an engineer paraphrasing a customer), so the extractor has to record that and not present it as a direct quote.

## Success measures

| measure | target for v1 | why |
| --- | --- | --- |
| Reviewer approval rate (approved + edited-then-approved) | ≥ 70% | Below this, reviewers lose trust and stop reviewing. |
| Fabricated excerpts in production | 0 | Checked automatically on every write (see `design.md`). |
| Share of approved insights edited before approval | tracked; falling | Edits show where prompts need work. |
| Time an insight sits unvalidated (median) | < 7 days | A stale queue means people haven't adopted the review step. |
| Outcomes flagged as unvalidated (delivery view) | falling | This is the job itself. |
| Cost per approved insight | tracked | Tells us whether it's worth turning on more sources. |

## Open questions

1. **New insight types.** Sales calls, surveys, feature requests and reviews don't fit the current `type` list. Should we add `sales_call`, `survey`, `feature_request` and `review`, or tag them with `source_system` and leave them as `other`? (Recommendation: add the types, since type is how people filter evidence.)
2. **Who can review?** Anyone in the account, or only the team that owns the linked outcome?
3. **Customer PII in excerpts.** Should we keep customer names and emails in verbatim quotes, or redact them when saving? (Recommendation: redact emails and phone numbers; keep company names, since they're often the point.)
4. **Where does the agent run in production?** On a schedule inside our backend, or only on demand from the UI? (v0 runs in Claude Code; see `design.md`.)
