import type { CSSProperties } from 'react';
import type { ReactNode } from 'react';
import type { ApiError } from '../lib/api';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <div className="spinner" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function Notice({ tone, children }: { tone?: 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className="notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function ErrorNotice({ error }: { error: ApiError | Error | undefined | null }) {
  if (!error) return null;
  return <Notice tone="error">{error.message}</Notice>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label} {hint && <span className="hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Qty({ value, onChange, max = 20, label }: { value: number; onChange: (n: number) => void; max?: number; label: string }) {
  return (
    <div className="qty" role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" aria-label={`Remove one ${label}`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Add one ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

/** Spacing for a `.stack` container. */
export const gap = (g: string) => ({ '--gap': g }) as CSSProperties;
