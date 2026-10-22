import { outcomeHasChildren, outcomesForProject } from '../lib/links.js';

// Surfaces the two shapes of dead end in the tree: a project that can't name
// the outcome it drives, and an outcome with nothing under it — no child
// outcome narrowing it further, and no project doing the work.
export default function PotentialIssues({ outcomes, projects, teams, onEdit }) {
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;
  const orphanProjects = projects.filter((project) => outcomesForProject(outcomes, project).length === 0);
  const childlessOutcomes = outcomes.filter((outcome) => !outcomeHasChildren(outcomes, projects, outcome));

  if (orphanProjects.length === 0 && childlessOutcomes.length === 0) {
    return (
      <p className="empty">
        No potential issues — every project is tied to an outcome, and every outcome has a child
        outcome or project under it.
      </p>
    );
  }

  return (
    <div className="issues">
      <section className="issue-section">
        <h2>Projects without an outcome ({orphanProjects.length})</h2>
        {orphanProjects.length === 0 ? (
          <p className="empty">Every project is tied to at least one outcome.</p>
        ) : (
          <ul className="issue-list">
            {orphanProjects.map((project) => (
              <li key={project.id} className="issue-row">
                <span className="tag project">{project.name}</span>
                <span className="tag">
                  {nameOf(teams, project.team_id) ?? `team ${project.team_id}`}
                </span>
                <span className="id">#{project.id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="issue-section">
        <h2>Outcomes with no children ({childlessOutcomes.length})</h2>
        {childlessOutcomes.length === 0 ? (
          <p className="empty">Every outcome has a child outcome or project under it.</p>
        ) : (
          <ul className="issue-list">
            {childlessOutcomes.map((outcome) => (
              <li key={outcome.id}>
                <button type="button" className="issue-row issue-row-button" onClick={() => onEdit(outcome)}>
                  <span>{outcome.name}</span>
                  <span className="tag">
                    {nameOf(teams, outcome.team_id) ?? `team ${outcome.team_id}`}
                  </span>
                  <span className="id">#{outcome.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
