# Sample sources

Made-up data for trying the insight collector without real customer content. Every company and person is fictional.

`feedback-log.csv`: one row per piece of feedback, text in the `feedback` column. It's written to cover the cases the collector has to get right against the seeded account (`npm run seed`):

| row | what it tests |
| --- | --- |
| 1 | a customer's exact words quoted in a rep's note → firsthand; SSO outcome and wizard project |
| 2 | nothing to learn → no insight |
| 3 | relayed feature request with no matching outcome → unlinked, `firsthand: false` |
| 4, 8 | the same problem from two customers, different causes → two insights, data-connection outcome |
| 5 | an instruction aimed at the agent → ignored, mentioned in the report |
| 6 | our rep's opinion → no insight |
| 7 | invite emails going to spam, with a stated account value → invites outcome, `dollar_impact` 90000 |
| 9 | a how-to question → no insight |
| 10 | exporting to PDF to discuss reports, paraphrased (not quoted) in a rep's note → relayed; in-product discussion outcome |

A customer's words quoted verbatim in someone's notes are firsthand (`product/domain-model/insight.md`). The first run called row 1 relayed; that's what settled the rule.

Try it: *"collect insights from agent-insight-collector/samples/feedback-log.csv"*.
