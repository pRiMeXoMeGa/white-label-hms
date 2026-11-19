import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

// A ~60-line history router: enough for this app without pulling in a dependency.

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === snapshot()) return;
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.scrollTo(0, 0);
  emit();
  focusHeading();
}

/**
 * Moves keyboard and screen-reader focus to the new page's heading. Pages that load data
 * render their heading a moment later, so this waits up to 3 seconds for it to appear,
 * and gives up if the guest has moved focus somewhere themselves in the meantime.
 */
function focusHeading() {
  const started = Date.now();
  const startFocus = document.activeElement;
  const attempt = () => {
    if (document.activeElement !== startFocus && document.activeElement !== document.body) return;
    const heading = document.querySelector<HTMLElement>('h1');
    if (!heading && Date.now() - started < 3000) {
      window.setTimeout(attempt, 100);
      return;
    }
    const target = heading ?? document.querySelector<HTMLElement>('main, .app');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  window.setTimeout(attempt, 50);
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, window.location.origin);
  return { pathname: url.pathname, search: url.searchParams };
}

/** Matches "/stay/:code/bill" style patterns; returns params or null. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp(
    `^${pattern.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
      keys.push(k);
      return '([^/]+)';
    })}/?$`,
  );
  const m = re.exec(pathname);
  if (!m) return null;
  const decode = (v: string) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return Object.fromEntries(keys.map((k, i) => [k, decode(m[i + 1] ?? '')]));
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target || /^https?:|^mailto:|^tel:/.test(href) || href.startsWith('/api/')) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}

export function useTitle(title: string, hotelName: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${hotelName}` : hotelName;
  }, [title, hotelName]);
}
