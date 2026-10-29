import { groupByRule, validateTree } from '../lib/validation.js';

// Lists every node that breaks a delivery rule (see lib/validation.js), one
// section per rule, using the same emoji the tree badges them with.
export default function PotentialIssues({ impacts = [], outcomes, projects, teams, insights = [], onEdit, onEditImpact, onEditProject }) {
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;
  const groups = groupByRule(validateTree({ outcomes, projects, insights, impacts }), {
    impacts,
    outcomes,
    projects,
  });

  const editorFor = (kind) => ({ impact: onEditImpact, outcome: onEdit, project: onEditProject })[kind];

  if (groups.every((group) => group.items.length === 0)) {
    return <p className="empty">No potential issues — the tree passes every delivery rule.</p>;
  }

  return (
    <div className="issues">
      {groups.map(({ rule, items }) => (
        <section key={rule.id} className="issue-section">
          <h2>
            {rule.emoji} {rule.title} ({items.length})
          </h2>
          <p className="issue-rule">{rule.description}</p>
          {items.length === 0 ? (
            <p className="empty">None.</p>
          ) : (
            <ul className="issue-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="issue-row issue-row-button"
                    onClick={() => editorFor(rule.appliesTo)(item)}
                  >
                    <span>{item.name}</span>
                    {rule.appliesTo !== 'impact' && (
                      <span className="tag">
                        {item.team_id == null ? 'No team' : (nameOf(teams, item.team_id) ?? `team ${item.team_id}`)}
                      </span>
                    )}
                    <span className="id">#{item.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
