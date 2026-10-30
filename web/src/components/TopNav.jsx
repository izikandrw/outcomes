const PAGES = [
  { id: 'map', label: 'Map' },
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'insights', label: 'Insights' },
  {
    id: 'review',
    label: 'Review insights',
    hint: 'Insights the collector suggested, waiting for you to approve or reject before they count as evidence',
  },
  { id: 'teams', label: 'Teams' },
];

// counts: { [pageId]: n } shown as a badge, e.g. suggestions waiting for review.
export default function TopNav({ page, onChange, counts = {} }) {
  return (
    <nav className="top-nav" aria-label="Primary">
      {PAGES.map(({ id, label, hint }) => (
        <button
          key={id}
          type="button"
          title={hint}
          aria-current={page === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          {label}
          {counts[id] > 0 && <span className="count">{counts[id]}</span>}
        </button>
      ))}
    </nav>
  );
}
