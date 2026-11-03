import { useEffect, useRef, useState } from 'react';
import { LinkIcon } from './icons.jsx';

const RESET_MS = 2000;
const MESSAGES = { copied: 'Link copied', failed: 'Couldn’t copy. Right-click to copy the link' };

// An item's label, like a Jira issue key: clicking copies a link to the item.
// It is a real link, so cmd-click still opens a new tab and right-click still
// offers Copy Link Address.
export default function CopyLinkLabel({ label, search }) {
  const [copyState, setCopyState] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Read from the anchor so a relative `search` comes out as a full URL.
    const { href } = event.currentTarget;
    let next = 'copied';
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      next = 'failed';
    }
    setCopyState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState(null), RESET_MS);
  }

  return (
    <span className="copy-link">
      <a href={search} title="Copy link" onClick={copy}>
        {label}
        <LinkIcon />
      </a>
      <span className="copy-link-status" role="status">
        {copyState && MESSAGES[copyState]}
      </span>
    </span>
  );
}
