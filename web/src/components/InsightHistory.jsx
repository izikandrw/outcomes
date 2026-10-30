import { formatDollars, impactAreaLabel, insightTypeLabel, rejectionReasonLabel, sentimentOf } from '../lib/links.js';

// An insight's history (insight_events, src/lib/insightEvents.js), oldest
// first: what the collector suggested, then each edit as what changed, each
// verdict, and each proposal that became a real outcome or project. The gap
// between the first entry and the last is what the collector got wrong.
export default function InsightHistory({ events, outcomes, projects }) {
  if (!events?.length) return <p className="hint">No history recorded for this insight.</p>;
  const names = {
    outcome: (id) => outcomes.find((outcome) => String(outcome.id) === String(id))?.name ?? `Outcome #${id}`,
    project: (id) => projects.find((project) => String(project.id) === String(id))?.name ?? `Project #${id}`,
  };
  return (
    <ol className="insight-history">
      {events.map((event) => (
        <li key={event.id}>
          <p className="meta">
            <strong>{headline(event)}</strong>
            <span className="hint">
              {' '}
              · {actorLabel(event)} · {formatTime(event.created_at)}
              {event.details?.backfilled && ' · rebuilt from the record'}
            </span>
          </p>
          <EventBody event={event} names={names} />
        </li>
      ))}
    </ol>
  );
}

function headline(event) {
  switch (event.action) {
    case 'created':
      return event.after?.status === 'unvalidated' ? 'Suggested' : 'Created';
    case 'edited':
      return 'Edited';
    case 'validated':
      return 'Approved';
    case 'rejected':
      return `Rejected: ${rejectionReasonLabel(event.after?.rejection_reason)}`;
    case 'reopened':
      return 'Sent back to review';
    case 'proposal_adopted':
      return `Proposed ${event.details?.kind} created`;
    default:
      return event.action;
  }
}

function actorLabel(event) {
  if (event.actor_role === 'collector') return 'insight collector';
  return event.actor_email ?? 'someone';
}

function EventBody({ event, names }) {
  if (event.action === 'created' && event.after) return <Suggestion snapshot={event.after} names={names} />;
  if (event.action === 'edited') {
    const changes = describeChanges(event.before, event.after, names);
    if (changes.length === 0) return null;
    return (
      <ul className="insight-history-changes">
        {changes.map((change, i) => (
          <li key={i}>{change}</li>
        ))}
      </ul>
    );
  }
  if (event.action === 'rejected' && event.after?.review_note) return <p className="hint">“{event.after.review_note}”</p>;
  if (event.action === 'proposal_adopted') {
    const { kind, id, proposal } = event.details ?? {};
    return (
      <p className="hint">
        “{proposal?.name}” now exists, so the insight links to {names[kind]?.(id) ?? id}
        {proposal?.rationale && <> because {proposal.rationale}</>}.
      </p>
    );
  }
  return null;
}

// Everything the collector said when it suggested the insight.
function Suggestion({ snapshot, names }) {
  const links = [
    ...snapshot.outcome_ids.map((id) => ['outcome', id, snapshot.link_rationales?.outcomes?.[id]]),
    ...snapshot.project_ids.map((id) => ['project', id, snapshot.link_rationales?.projects?.[id]]),
  ];
  const facts = [
    insightTypeLabel(snapshot.type),
    sentimentOf(snapshot.sentiment)?.label,
    snapshot.firsthand === true ? 'firsthand' : snapshot.firsthand === false ? 'relayed' : null,
    snapshot.dollar_impact != null ? formatDollars(snapshot.dollar_impact) : null,
    snapshot.impact_area ? impactAreaLabel(snapshot.impact_area) : null,
  ].filter(Boolean);
  return (
    <div className="insight-history-suggestion">
      <p>
        {snapshot.name} <span className="hint">· {facts.join(' · ')}</span>
      </p>
      {snapshot.description && <p className="hint">{snapshot.description}</p>}
      {snapshot.source_excerpt && <blockquote className="hint">“{snapshot.source_excerpt}”</blockquote>}
      {links.length === 0 && (snapshot.proposed_links ?? []).length === 0 && <p className="hint">No links suggested.</p>}
      <ul className="insight-history-changes">
        {links.map(([kind, id, rationale]) => (
          <li key={`${kind}-${id}`}>
            Link to {kind} <strong>{names[kind](id)}</strong>
            {rationale && <span className="hint"> · {rationale}</span>}
          </li>
        ))}
        {(snapshot.proposed_links ?? []).map((proposal) => (
          <li key={`proposed-${proposal.kind}-${proposal.name}`}>
            New {proposal.kind} <strong>{proposal.name}</strong>
            {proposal.rationale && <span className="hint"> · {proposal.rationale}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const FIELD_LABELS = {
  name: 'Name',
  type: 'Type',
  description: 'Description',
  source: 'Source',
  observed_at: 'Observed',
  dollar_impact: 'Dollar impact',
  impact_area: 'Impact area',
  sentiment: 'Sentiment',
  source_system: 'Source system',
  source_url: 'Source link',
  source_external_id: 'Source reference',
  source_excerpt: 'Excerpt',
  firsthand: 'Evidence',
};

const FIELD_VALUES = {
  type: insightTypeLabel,
  impact_area: impactAreaLabel,
  sentiment: (value) => sentimentOf(value)?.label ?? value,
  dollar_impact: formatDollars,
  firsthand: (value) => (value ? 'firsthand' : 'relayed'),
  observed_at: (value) => new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' }),
};

const showValue = (field, value) => (value == null || value === '' ? 'none' : (FIELD_VALUES[field]?.(value) ?? value));

// What an edit changed, one line each: fields, links removed or added, and
// proposals dismissed or added.
function describeChanges(before, after, names) {
  if (!before || !after) return [];
  const changes = [];
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    if (JSON.stringify(before[field] ?? null) === JSON.stringify(after[field] ?? null)) continue;
    changes.push(
      <>
        {label}: <del>{showValue(field, before[field])}</del> → {showValue(field, after[field])}
      </>
    );
  }
  for (const [kind, key] of [
    ['outcome', 'outcome_ids'],
    ['project', 'project_ids'],
  ]) {
    const was = new Set(before[key] ?? []);
    const now = new Set(after[key] ?? []);
    for (const id of was) {
      if (now.has(id)) continue;
      const rationale = before.link_rationales?.[`${kind}s`]?.[id];
      changes.push(
        <>
          Removed link to {kind} <strong>{names[kind](id)}</strong>
          {rationale && <span className="hint"> (collector: {rationale})</span>}
        </>
      );
    }
    for (const id of now) {
      if (!was.has(id)) changes.push(<>Linked to {kind} <strong>{names[kind](id)}</strong></>);
    }
  }
  const proposalKey = (proposal) => `${proposal.kind}:${proposal.name.trim().toLowerCase()}`;
  const proposedBefore = new Map((before.proposed_links ?? []).map((proposal) => [proposalKey(proposal), proposal]));
  const proposedAfter = new Map((after.proposed_links ?? []).map((proposal) => [proposalKey(proposal), proposal]));
  for (const [key, proposal] of proposedBefore) {
    if (!proposedAfter.has(key)) changes.push(<>Dismissed proposed {proposal.kind} <strong>{proposal.name}</strong></>);
  }
  for (const [key, proposal] of proposedAfter) {
    if (!proposedBefore.has(key)) changes.push(<>Proposed {proposal.kind} <strong>{proposal.name}</strong></>);
  }
  return changes;
}

const formatTime = (value) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
