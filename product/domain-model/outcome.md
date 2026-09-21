# Definition

A change in user or agent behavior that drives a business result.

An outcome names the behavior change, not the thing that gets built. "Admins invite a teammate in their first session" is an outcome; "build an invite modal" is not. If a statement doesn't describe someone doing something differently, it is an output, and it belongs to a project.

An outcome is only settled by evidence. The behavior change should be observable in product data, support volume, revenue, or another signal the team already trusts.

# Relationships

| entity | rule | reason |
| --- | --- | --- |
| outcome | Outcomes can contain 0 or many outcomes. | Large outcomes, especially ones that are more impact-level, need to be decomposed into smaller outcomes. |
| outcome | Outcomes belong to at most one parent outcome. An outcome with no parent is a top-level outcome for its team. | Outcomes are discrete behavior changes that should be scoped to at most one parent outcome. |
| team | Outcomes can be connected to one team. | That team is accountable for the outcome, even when other teams run projects against it. |
| project | Outcomes can be connected to 0 or many projects. | The projects should be creating outputs that will drive the outcome. |
| insight | Outcomes can be connected to 0 or many insights. | Those insights are the evidence that the outcome is worth pursuing. An outcome with no insight behind it is an assumption. |
| target | Outcomes can be connected to 0 or many targets. | A target is the outcome stated as numbers — the unit, the baseline and the value to reach. An outcome with no target is a sentence nobody can settle. |
| measurement | Outcomes are not connected to measurements directly. | Measurements are readings on a target; an outcome's progress is read through its targets. |
