import { useSyncExternalStore } from 'react';

// One polite live region for the whole app. Request cards call announce() when their status
// changes, so screen readers hear one short update instead of every card re-reading itself.

let message = '';
const listeners = new Set<() => void>();

export function announce(text: string) {
  // Clearing first makes a repeated message be read again.
  message = '';
  listeners.forEach((l) => l());
  window.setTimeout(() => {
    message = text;
    listeners.forEach((l) => l());
  }, 100);
}

export function LiveRegion() {
  const text = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => message,
  );
  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
