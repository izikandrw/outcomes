# Definition

A project is a bounded body of work with a definition of done. Its output is the thing that ships — a feature, a migration, a piece of content, a process change. Shipping the output is not the point; the outcome it is hoping to drive is.

Projects produce outputs that drive outcomes.

# Relationships

| entity | rule | reason |
| --- | --- | --- |
| project | Projects can contain 0 or many projects. | This is to represent that many projects are decomposed into smaller units of work that add up to fulfill the whole. |
| project | Projects can have 0 or 1 parent projects. A project with no parent is a top-level project. | Projects are discrete units of work that should be scoped to at most one parent project |
| outcome | Project can have 0 or many parent outcomes. | A project can have multiple reasons (outcomes) to do it. A project that can't name the outcome it drives is a project worth questioning. |
| team | A project is assigned to at most one team. A child project's team can differ from its parent's team. A project may start with no team, but every project should end up with one; until then it is flagged as ownerless. | One team ownership increases accountability. Projects that have multiple teams working on them should be decomposed into child projects and have those portions assigned to their respective teams. The team often isn't known when a project is first written down, e.g. when the insight collector proposes it. |
| insight | Projects can be connected to 0 or many insights. | Tying insights to projects makes the case for a project. |
| target | Projects are not connected to targets directly. | Targets belong to outcomes; a project's contribution to a target is read through the outcome it drives. |
| measurement | Projects are not connected to measurements directly. | Measurements are readings on a target; a project inherits them through the outcome and target, never directly. |
