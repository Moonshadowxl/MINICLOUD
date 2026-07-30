import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus behaviour: move focus in on open, keep Tab inside while open, and
 * put focus back where it came from on close.
 *
 * Without this, opening a file with the keyboard left focus on the row behind the
 * scrim and Tab walked off into the page underneath — the dialog looked modal and
 * behaved like an overlay.
 */
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Prefer whatever asked for focus (a search input), else the first control.
    const initial = root?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0];
    initial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        return onClose();
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || !root?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return ref;
}
