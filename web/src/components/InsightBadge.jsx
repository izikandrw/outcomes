import { formatDollars } from '../lib/links.js';

const plural = (count, word) => `${count} ${word} insight${count === 1 ? '' : 's'}`;

// Counts of the insights behind an entity: verified ones, and the collector's
// suggestions still waiting for a person (hidden when there are none). Each opens the list of them, showing
// that kind first. Used in the HTML views — the tree draws its own SVG version
// since it lives inside <svg>.
export default function InsightBadge({ count, suggested, dollars, label, onClick }) {
  return (
    <>
      <button
        type="button"
        className={['tag', 'insight-badge', count === 0 && 'empty'].filter(Boolean).join(' ')}
        title={`${plural(count, 'verified')} for ${label}`}
        aria-label={`${plural(count, 'verified')} for ${label}`}
        onClick={() => onClick('verified')}
      >
        💡 {count}
      </button>
      {suggested > 0 && (
        <button
          type="button"
          className="tag insight-badge suggested"
          title={`${plural(suggested, 'suggested')} for ${label}, waiting for review`}
          aria-label={`${plural(suggested, 'suggested')} for ${label}`}
          onClick={() => onClick('suggested')}
        >
          ✨ {suggested}
        </button>
      )}
      {dollars != null && (
        <button
          type="button"
          className="tag insight-badge"
          title={`${formatDollars(dollars)} total dollar impact for ${label}`}
          aria-label={`${formatDollars(dollars)} total dollar impact for ${label}`}
          onClick={() => onClick('verified')}
        >
          {formatDollars(dollars)}
        </button>
      )}
    </>
  );
}
