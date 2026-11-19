import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import type { ApiErrorBody } from '../../shared/types';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { RateLimiter } from '../lib/rate-limit';
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
  '.map': 'application/json',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

type Log = (msg: string, extra?: object) => void;

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
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
  const type = req.headers['content-type'] ?? '';
  if (!type.includes('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Send JSON');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body is not valid JSON');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function sendError(res: ServerResponse, status: number, code: string, message: string, details?: unknown, extra: Record<string, string> = {}) {
  const body: ApiErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

/** index.html with the white-label brand injected server-side, so there is no colour flash. */
function renderIndex(ctx: AppContext, template: string): string {
  const c = ctx.hotel.brand.colors;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const style = `<style>:root{--brand:${c.primary};--brand-ink:${c.primaryInk};--accent:${c.accent};--surface:${c.surface};--ink:${c.ink}}</style>`;
  return template
    .replaceAll('__HOTEL_NAME__', esc(ctx.hotel.brand.name))
    .replaceAll('__HOTEL_TAGLINE__', esc(ctx.hotel.brand.tagline))
    .replaceAll('__THEME_COLOR__', c.primary)
    .replace('<!--BRAND_STYLE-->', style);
}

export function createHttpServer(ctx: AppContext, log: Log) {
  const router = buildRouter(ctx);
  const requestBudget = new RateLimiter(Math.max(ctx.config.rateLimitPerMinute * 10, 120)); // all API calls, per IP
  const lookupFailures = new RateLimiter(ctx.config.rateLimitPerMinute); // failed code lookups, per IP
  const clientDir = resolve(ctx.config.clientDir);
  const indexPath = join(clientDir, 'index.html');
  let indexHtml: string | null = null;
  const getIndex = () => {
    if (indexHtml === null || ctx.config.env === 'development') {
      indexHtml = existsSync(indexPath) ? renderIndex(ctx, readFileSync(indexPath, 'utf8')) : null;
    }
    return indexHtml;
  };

  const isLookup = (path: string) => /^\/api\/(stays|reservations\/[^/]+|check-in)/.test(path);

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
    const ip = clientIp(req);
    requestBudget.hit(ip);
    const wait = Math.max(requestBudget.retryAfter(ip), isLookup(url.pathname) ? lookupFailures.retryAfter(ip) : 0);
    if (wait > 0) {
      sendError(res, 429, 'rate_limited', `Too many attempts. Try again in ${wait} seconds.`, undefined, { 'Retry-After': String(wait) });
      return;
    }
    const match = router.match(req.method ?? 'GET', url.pathname);
    if (match === null) return sendError(res, 404, 'not_found', 'No such endpoint');
    if (match === 'method_not_allowed') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    try {
      const body = await readJson(req);
      const result = await match.handler({ req, params: match.params, query: url.searchParams, body, ip });
      if (result && typeof result === 'object' && 'kind' in result) {
        const r = result as { kind: string } & Record<string, unknown>;
        if (r.kind === 'status') return sendJson(res, r.status as number, r.body);
        if (r.kind === 'binary') {
          const b = result as BinaryResult;
          res.writeHead(200, {
            ...SECURITY_HEADERS,
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
        if (err.status === 404 && isLookup(url.pathname)) lookupFailures.hit(ip);
        return sendError(res, err.status, err.code, err.message, err.details);
      }
      log('unhandled error', { path: url.pathname, error: err instanceof Error ? err.stack : String(err) });
      sendError(res, 500, 'internal_error', 'Something went wrong on our side. Please try again.');
    }
  }

  function handleStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(clientDir, rel);
    if (rel !== '/' && filePath.startsWith(clientDir) && existsSync(filePath) && statSync(filePath).isFile() && !filePath.endsWith('index.html')) {
      const hashed = /-[A-Z0-9]{8}\.(js|css)$/i.test(filePath);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      });
      return res.end(req.method === 'HEAD' ? undefined : readFileSync(filePath));
    }
    if (extname(rel)) return sendError(res, 404, 'not_found', 'File not found');
    // SPA fallback: every other path renders the app shell.
    const html = getIndex();
    if (!html) return sendError(res, 503, 'client_not_built', 'Web client not built. Run npm run build.');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME['.html']!, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  }

  return createServer((req, res) => {
    const started = performance.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.on('finish', () => {
      if (url.pathname.startsWith('/api/')) {
        log('request', { method: req.method, path: url.pathname, status: res.statusCode, ms: Math.round(performance.now() - started) });
      }
    });
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((err: unknown) => {
        log('fatal request error', { error: String(err) });
        if (!res.headersSent) sendError(res, 500, 'internal_error', 'Unexpected error');
      });
    } else {
      handleStatic(req, res, url);
    }
  });
}
