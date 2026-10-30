import { sentimentOf } from '../lib/links.js';

// The insight's sentiment as an emoji, named on hover and to screen readers.
// Nothing when it has none.
export default function SentimentBadge({ sentiment }) {
  const entry = sentimentOf(sentiment);
  if (!entry) return null;
  return (
    <span className="sentiment" role="img" aria-label={`${entry.label} sentiment`} title={`${entry.label} sentiment`}>
      {entry.emoji}
    </span>
  );
}
