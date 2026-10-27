const PAGES = [
  { id: 'map', label: 'Map' },
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'insights', label: 'Insights' },
  { id: 'review', label: 'Review' },
  { id: 'teams', label: 'Teams' },
];

// counts: { [pageId]: n } shown as a badge, e.g. suggestions waiting for review.
export default function TopNav({ page, onChange, counts = {} }) {
  return (
    <nav className="top-nav" aria-label="Primary">
      {PAGES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
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
