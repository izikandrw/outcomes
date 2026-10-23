# Definition

Impact is the business impact we wish to make.

# Examples
* Grow Revenue by 20% this year.

# Relationships

| entity | rule | reason |
| --- | --- | --- |
| outcome | Impacts can be connected to 0 or many outcomes. An outcome is connected to at most one impact, and only top-level outcomes carry the connection. | Impact is the "why" at the top of the tree. Child outcomes inherit their impact from their top-level ancestor, so it is never stored twice or in conflict. |
| impact | Impacts can contain 0 or many impacts. Impacts belong to at most one parent impact. An impact with no parent is a top-level impact. | Business goals decompose the same way outcomes do, e.g. a revenue goal split by segment. A top-level outcome can link to an impact at any depth. |
| team | Impacts are not connected to teams directly. | The teams working toward an impact are read through its outcomes and the projects that drive them, so the link is never stored and can't go stale. |
| target | Impacts can be connected to 0 or many targets. | The business result stated as numbers, e.g. revenue from its current baseline to +20%. Outcome targets count behavior, so they can't tell you whether the business result moved. |
| insight | Impacts are not connected to insights directly. | Insights are evidence for outcomes and projects. Their link to an impact is read through the outcomes they support. |
| project | Impacts are not connected to projects directly. | A project drives outcomes, and outcomes drive impact. The path through the outcome is the only one, so a project can't claim an impact its outcomes don't serve. |
| measurement | Impacts are not connected to measurements directly. | Measurements are readings on a target. An impact's progress is read through its targets. |
| account | Impacts belong to exactly one account. | Account is the tenancy boundary. An impact can't be shared or linked across accounts. |