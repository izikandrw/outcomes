import { groupByRule, validateTree } from '../lib/validation.js';

// How many nodes break each delivery rule (see lib/validation.js), as compact
// emoji counts for the header. Clicking one opens that rule's section of the
// Potential Issues view.
export default function IssueCounts({ impacts = [], outcomes, projects, insights = [], onOpen }) {
  const groups = groupByRule(validateTree({ outcomes, projects, insights, impacts }), {
    impacts,
    outcomes,
    projects,
  });

  return (
    <div className="issue-counts" role="group" aria-label="Potential issues">
      {groups.map(({ rule, items }) => (
        <button
          key={rule.id}
          type="button"
          className={['issue-count', items.length === 0 && 'ok'].filter(Boolean).join(' ')}
          title={`${rule.title}: ${rule.description}`}
          aria-label={`${rule.title}: ${items.length}`}
          onClick={() => onOpen(rule)}
        >
          <span aria-hidden="true">{rule.emoji}</span>
          {items.length}
        </button>
      ))}
    </div>
  );
}
