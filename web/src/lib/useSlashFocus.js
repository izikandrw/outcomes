import { useEffect } from 'react';

// Pressing "/" puts the cursor in a page's search box, as on GitHub and Gmail.
// It is left alone while you are typing somewhere else, or holding a modifier,
// so a "/" in a field or a browser shortcut still does what it would.
export default function useSlashFocus(ref) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      const input = ref.current;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref]);
}
