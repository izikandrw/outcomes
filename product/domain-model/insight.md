# Definition

Specific evidence that something (e.g. an outcome or a project) should be pursued.

An insight is a single observation with a source — a support ticket, a session recording, an interview quote, a funnel drop-off, an experiment result. It is specific enough that someone else could go back and check it.

An insight is not a conclusion. "Users churn because onboarding is slow" is an interpretation; "11 of 14 interviewed admins abandoned setup at the SSO step" is an insight. The interpretation lives in the outcome the insight is attached to.

Insights are reusable. The same observation can justify several outcomes and several projects, and it stays on the record after the work it justified is finished.

Insights have a type.

Insights can carry a dollar impact: the estimated amount of money the observation represents, such as revenue at risk or cost incurred. It is optional, since not every observation can be priced.

Insights have a status: unvalidated, validated or rejected. Only a validated insight is evidence. An unvalidated insight is a suggestion — typically one the insight collector agent pulled out of an external source (see `product/agents/insight-collector/`) — waiting for a person to approve or reject it. Insights people record themselves are validated from the start. A rejected insight is kept, not deleted, so the same suggestion isn't made again; it never counts as evidence. A person can undo a review, approval or rejection, which sends the insight back to unvalidated.

Insights can carry their provenance: the external system they came from (a spreadsheet, Attention, Jira…), a link or id that finds the original there, the verbatim excerpt the observation rests on, and whether it is firsthand (the customer said or did it) or relayed by someone else. The source material itself stays in the external tool; the insight points back to it.

Each insight has a sentiment: positive (praise, something working), negative (a complaint, pain, a churn risk) or neutral. Insights recorded before sentiment existed may have none.

An insight is firsthand when it rests on what a customer said or did: their own words, including words quoted verbatim by someone else, such as a sales rep's notes or a support summary. It is relayed when someone else's paraphrase or summary is all there is ("customer X asked for…").

Insights can have an impact area: the part of the business the impact lands on — acquisition, activation, retention, expansion, cost, or other. It is a single value, since the dollar impact is a single number and splitting it across areas would be a guess. It is optional.

# Relationships

Insights can be connected to one or more outcomes, as evidence that the outcome is worth pursuing.

Insights can be connected to one or more projects, as evidence that the project should be built.

A connection made by the insight collector carries a one-line rationale for why the insight supports that outcome or project, so a reviewer can judge the link as well as the insight.

Insights do not nest. Unlike outcomes, projects and teams, an insight is a leaf: it is either evidence or it isn't.
