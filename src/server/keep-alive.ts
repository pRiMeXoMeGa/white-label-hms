import type { AppConfig } from './config/env';

/**
 * Requests the service's own public URL every KEEP_ALIVE_MINUTES so a free host never sees it
 * idle (Render stops free services after 15 minutes without traffic, and a restart wipes the
 * SQLite file in the container). Runs only when a public URL is known: KEEP_ALIVE_URL, or
 * RENDER_EXTERNAL_URL which Render sets automatically.
 */
export function startKeepAlive(config: AppConfig, log: (msg: string, extra?: object) => void): () => void {
  const { url, minutes } = config.keepAlive;
  if (!url || minutes === 0 || config.env !== 'production') return () => undefined;
  const target = `${url.replace(/\/$/, '')}/api/health`;
  const ping = async () => {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) log('keep-alive ping failed', { status: res.status });
    } catch (err) {
      log('keep-alive ping failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };
  log('keep-alive started', { target, everyMinutes: minutes });
  const handle = setInterval(ping, minutes * 60_000);
  handle.unref();
  return () => clearInterval(handle);
}
