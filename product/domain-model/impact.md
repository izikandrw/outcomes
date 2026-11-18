# Definition

A result that grows the business: revenue up or costs down. It is written from the company's side and counted in money or a direct proxy for it, such as ARR, net revenue retention, win rate, churned revenue, or support or infrastructure cost. A test: would the CFO or the board track it?

An impact is not something customers do, and not something the team ships. "Admins invite a teammate in their first session" is a change in customer behavior, so it's an outcome that drives an impact. "Launch the public API" or "Get the API funded for production" is a project milestone. "Customers stop over-granting admin access" is an outcome; the impact it drives might be "Win more enterprise deals that require least-privilege access." If a statement doesn't move revenue or cost by itself, it isn't an impact yet; ask what business result it leads to.

Risk counts when it's stated as money, such as revenue at risk from churn or the cost of security incidents.

# Examples
* Grow revenue by 20% this year.
* Raise net revenue retention from 105% to 112%.
* Cut support cost per account by 15%.

# Not impacts
* Ship the public API. (a project)
* Customers integrate the API into their BI pipelines. (an outcome)
* Five teams adopt the new framework. (an outcome, or a project's target)

# Relationships

| entity | rule | reason |
| --- | --- | --- |
| outcome | Impacts can be connected to 0 or many outcomes. An outcome is connected to at most one impact, and only top-level outcomes carry the connection. | Impact is the "why" at the top of the tree. Child outcomes inherit their impact from their top-level ancestor, so it is never stored twice or in conflict. |
| impact | Impacts can contain 0 or many impacts. Impacts belong to at most one parent impact. An impact with no parent is a top-level impact. Deleting an impact keeps what sits under it: child impacts become top-level, and linked outcomes and projects just lose the link. | Business goals decompose the same way outcomes do, e.g. a revenue goal split by segment. A top-level outcome can link to an impact at any depth. A parent shows how much of its target what rolls up to it accounts for, derived from targets in the same unit; a child with no target there counts what its own children add up to. |
| team | Impacts are not connected to teams directly. | The teams working toward an impact are read through its outcomes and the projects that drive it, so the link is never stored and can't go stale. |
| target | Impacts can own 0 or many targets. A target belongs to exactly one impact, outcome or project. | The business result stated as numbers, e.g. ARR from 1000 to 1200, and shown inside the impact rather than as a second thing to link. Several are allowed because one result can have leading and lagging signals. Outcome targets count behavior, so they can't tell you whether the business result moved. |
| insight | Impacts are not connected to insights directly. | Insights are evidence for outcomes and projects. Their link to an impact is read through the outcomes they support. |
| project | Impacts can be connected directly to 0 or many projects. A project can't link to an impact it already reaches through an outcome or a child impact. | Usually a project drives outcomes and outcomes drive impact, but some work serves the business result with no customer outcome in between. |
| measurement | Impacts are not connected to measurements directly. | Measurements are readings on a target. An impact's progress is read through its targets. |
| account | Impacts belong to exactly one account. | Account is the tenancy boundary. An impact can't be shared or linked across accounts. |