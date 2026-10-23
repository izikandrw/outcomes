import { formatDollars } from '../lib/links.js';

// Count of insights behind an entity; opens the list of them. Used in the HTML
// views — the tree draws its own SVG version since it lives inside <svg>.
export default function InsightBadge({ count, dollars, label, onClick }) {
  return (
    <>
      <button
        type="button"
        className={['tag', 'insight-badge', count === 0 && 'empty'].filter(Boolean).join(' ')}
        title={`${count} insight${count === 1 ? '' : 's'} for ${label}`}
        aria-label={`${count} insight${count === 1 ? '' : 's'} for ${label}`}
        onClick={onClick}
      >
        💡 {count}
      </button>
      {dollars != null && (
        <button
          type="button"
          className="tag insight-badge"
          title={`${formatDollars(dollars)} total dollar impact for ${label}`}
          aria-label={`${formatDollars(dollars)} total dollar impact for ${label}`}
          onClick={onClick}
        >
          {formatDollars(dollars)}
        </button>
      )}
    </>
  );
}
