import { useEffect, useId, useRef } from 'react';
import './FormDialog.css';

function FormDialog({ title, description, onClose, isBusy = false, children }) {
  const headingId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(isBusy);
  closeRef.current = onClose;
  busyRef.current = isBusy;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusableSelector = [
      'button:not(:disabled)',
      'input:not(:disabled):not([type="hidden"])',
      'select:not(:disabled)',
      'textarea:not(:disabled)',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');
    const initialField = panel.querySelector('input:not([type="hidden"]), select, textarea');
    (initialField || panel).focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const focusable = [...panel.querySelectorAll(focusableSelector)];
        if (!focusable.length) {
          event.preventDefault();
          panel.focus();
        } else if (event.shiftKey && (
          document.activeElement === focusable[0] || !panel.contains(document.activeElement)
        )) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!event.shiftKey && (
          document.activeElement === focusable[focusable.length - 1]
          || !panel.contains(document.activeElement)
        )) {
          event.preventDefault();
          focusable[0].focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEvent('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      className="form-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="form-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <div className="form-dialog-heading">
          <div>
            <h2 id={headingId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="form-dialog-close"
            aria-label="Close form"
            disabled={isBusy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default FormDialog;
