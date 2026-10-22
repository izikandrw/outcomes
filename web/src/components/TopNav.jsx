const PAGES = [
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'teams', label: 'Teams' },
];

export default function TopNav({ page, onChange }) {
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
        </button>
      ))}
    </nav>
  );
}
