import { NAV_PAGES } from '../lib/navPages.js';

// counts: { [pageId]: n } shown as a badge, e.g. suggestions waiting for review.
export default function TopNav({ page, onChange, counts = {} }) {
  return (
    <nav className="top-nav" aria-label="Primary">
      {NAV_PAGES.map(({ id, label, hint }) => (
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
