# Definition

A result the customer wants to see, which in turn drives a business result (impact). The customer can be a person or an agent.

An outcome is written from the customer's side: what they get, not what the business wants from them and not what gets built. "Customers see their own data in the product on day one" is an outcome. "New admins connect their data in their first session" is a metric the business wants, and belongs in a target if it is how you count progress. "Build a guided setup" is an output, and belongs to a project. If the customer wouldn't recognize a statement as something they want, it isn't an outcome yet.

An outcome is only settled by evidence. The result should be observable in what customers do, product data, support volume, revenue, or another signal the team already trusts.

# Relationships

| entity | rule | reason |
| --- | --- | --- |
| outcome | Outcomes can contain 0 or many outcomes. | Large outcomes should possibly be decomposed into smaller outcomes. |
| outcome | Outcomes belong to at most one parent outcome. An outcome with no parent is a top-level outcome for its team. | Outcomes are discrete customer results that should be scoped to at most one parent outcome. A top-level outcome should map to a business impact |
| team | Outcomes can be connected to one team. An outcome may start with no team, but every outcome should end up with one; until then it is flagged as ownerless. | That team is accountable for the outcome, even when other teams run projects against it. The team often isn't known when an outcome is first written down, e.g. when the insight collector proposes it. |
| project | Outcomes can be connected to 0 or many projects. | The projects should be creating outputs that will drive the outcome. |
| insight | Outcomes can be connected to 0 or many insights. | Those insights are the evidence that the outcome is worth pursuing. An outcome with no insight behind it is an assumption. |
| target | Outcomes can own 0 or many targets. A target belongs to exactly one outcome or impact. | A target is the outcome stated as numbers — the unit, the baseline and the value to reach — and is shown inside the outcome rather than beside it. An outcome with no target is a sentence nobody can settle. |
| measurement | Outcomes are not connected to measurements directly. | Measurements are readings on a target; an outcome's progress is read through its targets. |
