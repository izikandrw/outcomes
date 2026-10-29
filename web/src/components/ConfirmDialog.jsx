import { useEffect, useRef } from 'react';

// Stands in for window.confirm. Native <dialog> again, so opened with
// showModal() it lands in the top layer above any edit modal already open.
export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  const ref = useRef(null);
  // Only a press that starts and ends on the backdrop cancels, so dragging a
  // selection out of the dialog leaves it open.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal confirm"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (event.target === ref.current && pressedBackdrop.current) onCancel();
        pressedBackdrop.current = false;
      }}
    >
      <div className="modal-body">
        <h2>{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="actions form-actions">
          <button type="button" className="ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="danger-solid" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
