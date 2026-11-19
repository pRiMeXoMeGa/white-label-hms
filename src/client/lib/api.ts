import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiErrorBody } from '../../shared/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      headers: init?.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline. Check your connection and try again.');
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetches `path` (re-fetching when it changes), optionally polling every `pollMs`.
 * - Data from a previous path is never shown for a new one.
 * - A poll is skipped while the previous request is still running.
 * - Only the newest request's answer is kept, so a slow poll that started before an action
 *   (a cancel, say) cannot overwrite the fresher result of the reload after it.
 */
export function useApi<T>(path: string | null, pollMs?: number): Resource<T> {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: ApiError }>({ path });
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!path) return;
    const mine = ++latest.current;
    inFlight.current = true;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (latest.current === mine) setState({ path, data: d });
      })
      .catch((e: unknown) => {
        if (latest.current !== mine) return;
        const error = e instanceof ApiError ? e : new ApiError(0, 'error', String(e));
        setState((s) => ({ path, data: s.path === path ? s.data : undefined, error }));
      })
      .finally(() => {
        if (latest.current !== mine) return;
        inFlight.current = false;
        setLoading(false);
      });
  }, [path, tick]);

  useEffect(() => {
    if (!path || !pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !inFlight.current) setTick((t) => t + 1);
    }, pollMs);
    return () => window.clearInterval(id);
  }, [path, pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state.path === path;
  const data = current ? state.data : undefined;
  return { data, error: current ? state.error : undefined, loading: (loading || !current) && data === undefined && Boolean(path), reload };
}
