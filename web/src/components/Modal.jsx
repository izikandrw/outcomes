import { useEffect, useRef } from 'react';
import { CloseIcon } from './icons.jsx';

// Built on native <dialog>, so the browser supplies the top layer, the backdrop,
// focus trapping and Esc handling rather than us reimplementing them.
// `header`, when given, replaces the plain text title in the head (e.g. a
// clickable tag) — `title` still supplies the accessible name either way.
export default function Modal({ title, header, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
      if (dialog.open) dialog.close();
    };
  }, []);

  // Esc fires `cancel`; close through React so the dialog is unmounted rather
  // than left open-but-hidden in the DOM.
  function cancel(event) {
    event.preventDefault();
    onClose();
  }

  // A click reaches the <dialog> itself only when it lands on the backdrop —
  // anything inside the modal hits .modal-body first.
  function click(event) {
    if (event.target === ref.current) onClose();
  }

  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={cancel} onClick={click}>
      <div className="modal-body">
        <div className="modal-head">
          {header ?? <h2>{title}</h2>}
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
