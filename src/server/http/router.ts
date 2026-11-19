import type { IncomingMessage } from 'node:http';
import type { z } from 'zod';
import { badRequest } from '../lib/errors';

export interface RequestContext {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  ip: string;
}

export type BinaryResult = { kind: 'binary'; contentType: string; body: Uint8Array; filename?: string };
export type HandlerResult = unknown | { kind: 'status'; status: number; body: unknown } | BinaryResult;
export type Handler = (rc: RequestContext) => HandlerResult | Promise<HandlerResult>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: 'GET' | 'POST', path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
        keys.push(k);
        return '([^/]+)';
      })}$`,
    );
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }

  get(path: string, h: Handler) {
    return this.add('GET', path, h);
  }

  post(path: string, h: Handler) {
    return this.add('POST', path, h);
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | 'method_not_allowed' | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1] ?? '');
        } catch {
          throw badRequest('The address contains invalid characters');
        }
      });
      return { handler: r.handler, params };
    }
    return pathMatched ? 'method_not_allowed' : null;
  }
}

export const created = (body: unknown) => ({ kind: 'status' as const, status: 201, body });

/** Empty or whitespace-only strings in a body are treated as fields that were not sent. */
function dropBlankStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropBlankStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => !(typeof v === 'string' && v.trim() === ''))
        .map(([k, v]) => [k, dropBlankStrings(v)]),
    );
  }
  return value;
}

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(dropBlankStrings(data));
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(fields[0] ? `${fields[0].path ? `${fields[0].path}: ` : ''}${fields[0].message}` : 'Invalid input', { fields });
  }
  return result.data;
}
