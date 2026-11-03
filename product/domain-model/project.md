# Definition

A project is a bounded body of work with a definition of done. Its output is the thing that ships — a feature, a migration, a piece of content, a process change. Shipping the output is not the point; the outcome it is hoping to drive is.

Projects produce outputs that drive outcomes.

# Relationships

| entity | rule | reason |
| --- | --- | --- |
| project | Projects can contain 0 or many projects. | This is to represent that many projects are decomposed into smaller units of work that add up to fulfill the whole. |
| project | Projects can have 0 or 1 parent projects. A project with no parent is a top-level project. | Projects are discrete units of work that should be scoped to at most one parent project |
| outcome | Project can have 0 or many parent outcomes. | A project can have multiple reasons (outcomes) to do it. A project that can name neither an outcome nor an impact it drives is a project worth questioning. |
| impact | Projects can be connected directly to 0 or many impacts. A project can't link to an impact it already reaches through an outcome or a child impact. | Some work serves a business result with no customer outcome in between, e.g. a pricing change or a cost reduction. The direct link says so rather than inventing an outcome to route through. |
| team | A project is assigned to at most one team. A child project's team can differ from its parent's team. A project may start with no team, but every project should end up with one; until then it is flagged as ownerless. | One team ownership increases accountability. Projects that have multiple teams working on them should be decomposed into child projects and have those portions assigned to their respective teams. The team often isn't known when a project is first written down, e.g. when the insight collector proposes it. |
| insight | Projects can be connected to 0 or many insights. | Tying insights to projects makes the case for a project. |
| target | Projects can own 0 or many targets. A target belongs to exactly one outcome, impact or project. | States what the work itself has to reach, and is shown inside the project. A project's target rolls up to the outcomes and impacts it drives and to its parent project, wherever they have a target in the same unit, so a plan can be checked against the parent's number. |
| measurement | Projects are not connected to measurements directly. | Measurements are readings on a target; a project's progress is read through its targets. |
