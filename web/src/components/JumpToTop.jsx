import { useEffect, useState } from 'react';
import { ArrowUpIcon } from './icons.jsx';

// Shown only once the page has been scrolled this many screens down, so short
// pages never get it.
const SCREENS = 2;

export default function JumpToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const update = () => setShown(window.scrollY > window.innerHeight * SCREENS);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <button
      type="button"
      className="jump-to-top"
      data-shown={shown}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      aria-label="Jump to top"
      title="Jump to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUpIcon />
    </button>
  );
}
