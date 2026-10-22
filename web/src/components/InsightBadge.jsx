// Count of insights behind an entity; opens the list of them. Used in the HTML
// views — the tree draws its own SVG version since it lives inside <svg>.
export default function InsightBadge({ count, label, onClick }) {
  return (
    <button
      type="button"
      className={['tag', 'insight-badge', count === 0 && 'empty'].filter(Boolean).join(' ')}
      title={`${count} insight${count === 1 ? '' : 's'} for ${label}`}
      aria-label={`${count} insight${count === 1 ? '' : 's'} for ${label}`}
      onClick={onClick}
    >
      💡 {count}
    </button>
  );
}
