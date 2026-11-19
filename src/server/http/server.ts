import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import type { ApiErrorBody } from '../../shared/types';
import type { AppContext } from '../context';
import { HttpError, LookupError } from '../lib/errors';
import { RateLimiter, RecentSet } from '../lib/rate-limit';
import type { BinaryResult } from './router';
import { buildRouter } from './routes';

const MAX_BODY_BYTES = 64 * 1024;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const BASE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

type Log = (msg: string, extra?: object) => void;

/**
 * Client address for rate limiting. Behind a proxy (Render), the proxy appends the real client
 * address to the right of X-Forwarded-For; anything to its left was sent by the client and can be
 * forged, so the address `trustProxyHops` entries from the right is used.
 */
export function clientIp(req: IncomingMessage, trustProxyHops: number): string {
  const socketIp = req.socket.remoteAddress || 'unknown';
  if (trustProxyHops === 0) return socketIp;
  const header = req.headers['x-forwarded-for'];
  const entries = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return entries[entries.length - trustProxyHops] ?? entries[0] ?? socketIp;
}

/** Hides booking references and Stay IDs (bearer keys) in logs. */
export function maskPath(path: string): string {
  return path.replace(/^(\/api\/(?:stays|reservations))\/[^/]+/, '$1/:code');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large', 'Request body is too large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'unsupported_media_type', 'Send JSON');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body is not valid JSON');
  }
}

/** index.html with the white-label brand injected server-side, so there is no colour flash. */
function renderIndex(ctx: AppContext, template: string): string {
  const c = ctx.hotel.brand.colors;
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
  const style = `<style>:root{--brand:${c.primary};--brand-ink:${c.primaryInk};--accent:${c.accent};--surface:${c.surface};--ink:${c.ink}}</style>`;
  return template
    .replaceAll('__HOTEL_NAME__', esc(ctx.hotel.brand.name))
    .replaceAll('__HOTEL_TAGLINE__', esc(ctx.hotel.brand.tagline))
    .replaceAll('__THEME_COLOR__', c.primary)
    .replace('<!--BRAND_STYLE-->', style);
}

export function createHttpServer(ctx: AppContext, log: Log) {
  const router = buildRouter(ctx);
  const headers: Record<string, string> =
    ctx.config.env === 'production'
      ? { ...BASE_HEADERS, 'Strict-Transport-Security': 'max-age=15552000; includeSubDomains' }
      : BASE_HEADERS;

  const limit = ctx.config.rateLimitPerMinute;
  // General budget: per Stay ID for in-stay calls (so guests sharing hotel Wi-Fi don't share a
  // budget), per client address for everything else.
  const requestBudget = new RateLimiter(Math.max(limit * 10, 300));
  // Brute-force guard: counts only lookups of codes that do not exist, per client address.
  const lookupFailures = new RateLimiter(limit);
  // Codes that resolved recently keep working for their owners even if their address is blocked.
  const knownCodes = new RecentSet();

  const clientDir = resolve(ctx.config.clientDir);
  const indexPath = join(clientDir, 'index.html');
  let indexHtml: string | null = null;
  const getIndex = () => {
    if (indexHtml === null || ctx.config.env === 'development') {
      indexHtml = existsSync(indexPath) ? renderIndex(ctx, readFileSync(indexPath, 'utf8')) : null;
    }
    return indexHtml;
  };

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const sendError = (
    res: ServerResponse,
    status: number,
    code: string,
    message: string,
    details?: unknown,
    extra: Record<string, string> = {},
  ) => {
    const body: ApiErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
    res.end(JSON.stringify(body));
  };

  const LOOKUP_PATH = /^\/api\/(?:stays|reservations)\/([^/]+)/;
  const isLookupPath = (path: string) => LOOKUP_PATH.test(path) || path === '/api/check-in';
  const codeIn = (path: string) => LOOKUP_PATH.exec(path)?.[1]?.toUpperCase() ?? null;

  async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL) {
    const ip = clientIp(req, ctx.config.trustProxyHops);
    const code = codeIn(pathname);
    const budgetKey = pathname.startsWith('/api/stays/') && code ? `stay:${code}` : `ip:${ip}`;
    requestBudget.hit(budgetKey);
    let wait = requestBudget.retryAfter(budgetKey);
    if (!wait && isLookupPath(pathname) && !(code && knownCodes.has(code))) wait = lookupFailures.blockedFor(ip);
    if (wait > 0) {
      sendError(res, 429, 'rate_limited', `Too many attempts. Try again in ${wait} seconds.`, undefined, { 'Retry-After': String(wait) });
      return;
    }
    try {
      // HEAD is answered like GET; Node leaves out the body for HEAD requests.
      const method = req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET');
      const match = router.match(method, pathname);
      if (match === null) throw new HttpError(404, 'not_found', 'No such endpoint');
      if (match === 'method_not_allowed') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      const body = await readJson(req);
      const result = await match.handler({ req, params: match.params, query: url.searchParams, body, ip });
      if (code) knownCodes.add(code);
      if (result && typeof result === 'object' && 'kind' in result) {
        const r = result as { kind: string } & Record<string, unknown>;
        if (r.kind === 'status') return sendJson(res, r.status as number, r.body);
        if (r.kind === 'binary') {
          const b = result as BinaryResult;
          res.writeHead(200, {
            ...headers,
            'Content-Type': b.contentType,
            'Cache-Control': 'no-store',
            ...(b.filename ? { 'Content-Disposition': `attachment; filename="${b.filename}"` } : {}),
          });
          return res.end(Buffer.from(b.body));
        }
      }
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err instanceof LookupError) lookupFailures.hit(ip);
        return sendError(res, err.status, err.code, err.message, err.details);
      }
      log('unhandled error', { path: maskPath(pathname), error: err instanceof Error ? err.stack : String(err) });
      sendError(res, 500, 'internal_error', 'Something went wrong on our side. Please try again.');
    }
  }

  function handleStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return sendError(res, 400, 'bad_request', 'The address contains invalid characters');
    }
    const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(clientDir, rel);
    if (
      rel !== '/' &&
      filePath.startsWith(clientDir) &&
      !filePath.endsWith('.map') &&
      !filePath.endsWith('index.html') &&
      existsSync(filePath) &&
      statSync(filePath).isFile()
    ) {
      const hashed = /-[A-Z0-9]{8}\.(js|css)$/i.test(filePath);
      res.writeHead(200, {
        ...headers,
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      });
      return res.end(req.method === 'HEAD' ? undefined : readFileSync(filePath));
    }
    if (extname(rel)) return sendError(res, 404, 'not_found', 'File not found');
    // SPA fallback: every other path renders the app shell.
    const html = getIndex();
    if (!html) return sendError(res, 503, 'client_not_built', 'Web client not built. Run npm run build.');
    res.writeHead(200, { ...headers, 'Content-Type': MIME['.html']!, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  }

  return createServer((req, res) => {
    const started = performance.now();
    // Nothing a client sends may take the process down: every path below is guarded.
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendError(res, 400, 'bad_request', 'Malformed request address');
    }
    // Trailing slashes are ignored on API paths (/api/hotel/ == /api/hotel).
    const pathname = url.pathname.length > 5 && url.pathname.startsWith('/api/') ? url.pathname.replace(/\/+$/, '') : url.pathname;
    res.on('finish', () => {
      if (pathname.startsWith('/api/')) {
        log('request', { method: req.method, path: maskPath(pathname), status: res.statusCode, ms: Math.round(performance.now() - started) });
      }
    });
    try {
      if (pathname.startsWith('/api/')) {
        handleApi(req, res, pathname, url).catch((err: unknown) => {
          log('fatal request error', { error: String(err) });
          if (!res.headersSent) sendError(res, 500, 'internal_error', 'Unexpected error');
        });
      } else {
        handleStatic(req, res, pathname);
      }
    } catch (err) {
      log('fatal request error', { error: String(err) });
      if (!res.headersSent) sendError(res, 500, 'internal_error', 'Unexpected error');
    }
  });
}
