import { groupByRule, validateTree } from '../lib/validation.js';

// How many nodes break each delivery rule (see lib/validation.js), as compact
// emoji counts for the header. Clicking one opens the list of the kind of thing
// the rule applies to, filtered to the ones that break it; `activeId` is the
// rule that list is filtered by.
export default function IssueCounts({ impacts = [], outcomes, projects, insights = [], activeId, onOpen }) {
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
          className={['issue-count', items.length === 0 && 'ok', rule.id === activeId && 'active']
            .filter(Boolean)
            .join(' ')}
          title={`${rule.title}: ${rule.description}`}
          aria-label={`${rule.title}: ${items.length}`}
          aria-pressed={rule.id === activeId}
          onClick={() => onOpen(rule)}
        >
          <span aria-hidden="true">{rule.emoji}</span>
          {items.length}
        </button>
      ))}
    </div>
  );
}

const NOUNS = { impact: 'impacts', outcome: 'outcomes', project: 'projects' };

// Says a list is showing only what breaks `rule`, with a way back to all of it.
export function IssueFilter({ rule, shown, total, onClear }) {
  const noun = NOUNS[rule.appliesTo];
  return (
    <div className="issue-filter" role="status">
      <span className="issue-filter-rule">
        {rule.emoji} {rule.title}
      </span>
      <span className="issue-filter-detail">
        {shown === 0 ? `No ${noun} have this issue.` : `${shown} of ${total} ${noun}. ${rule.description}`}
      </span>
      <button type="button" className="filter-clear" onClick={onClear}>
        Show all {noun}
      </button>
    </div>
  );
}
