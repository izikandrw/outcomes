import { useEffect, useRef } from 'react';
import { CloseIcon } from './icons.jsx';
import { FIRST_FIELD } from './Modal.jsx';

// Modal's counterpart for an item opened from the map: it docks to the left,
// like a Jira issue view, and leaves the page usable beside it, so the map can
// still be scrolled and another card clicked. Being non-modal it gets none of
// <dialog>'s help, so focus and Esc are handled here.
export default function SidePanel({ title, header, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const panel = ref.current;
    (panel.querySelector(FIRST_FIELD) ?? panel).focus();
    // Hand focus back only if it went away with the panel: when another card
    // was clicked it is already where it belongs.
    return () => {
      if (document.activeElement === document.body) opener?.focus?.();
    };
  }, []);

  // On window so it runs after the document listeners of a menu inside the
  // panel, which claim their Escape with preventDefault. A dialog over the
  // panel (a delete confirmation) closes first, through its own cancel.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog:modal')) return;
      onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside ref={ref} className="side-panel" aria-label={title} tabIndex={-1}>
      <div className="modal-body">
        <div className="modal-head">
          {header ?? <h2>{title}</h2>}
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </aside>
  );
}
