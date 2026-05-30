import type { IncomingMessage } from 'node:http';
import type { KozoRequest, Services } from './types.js';

/** Per-request DI factory + optional teardown — set via `createKozo({ scopedServices })`. */
export interface ScopeConfig<
  TBase extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, unknown>,
> {
  base: TBase;
  factory: (base: TBase, req: KozoRequest) => TScoped | Promise<TScoped>;
  onEnd?: (scoped: TScoped, error?: Error) => void | Promise<void>;
}

/** Internal scope handle passed to route compilers (erased generics). */
export type AnyScopeConfig = ScopeConfig<Services, Record<string, unknown>>;

export interface ResolvedScope {
  services: Services;
  finish: (error?: Error) => Promise<void>;
}

/** Merge singleton services with per-request scoped values. */
export function mergeServices(base: Services, scoped: Record<string, unknown>): Services {
  return Object.assign({}, base, scoped);
}

/** Resolve scoped services once per request; calls `onEnd` via {@link ResolvedScope.finish}. */
export async function resolveScopedServices(
  config: AnyScopeConfig,
  req: KozoRequest,
): Promise<ResolvedScope> {
  const scoped = await config.factory(config.base, req);
  return {
    services: mergeServices(config.base, scoped),
    finish: async (error?: Error) => {
      if (config.onEnd) await config.onEnd(scoped, error);
    },
  };
}

/** `KozoRequest` adapter for Node.js `IncomingMessage` (nativeListen path). */
export class IncomingReqAdapter implements KozoRequest {
  constructor(private readonly req: IncomingMessage) {}

  header(name: string): string | undefined {
    const v = this.req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  }

  get url(): string {
    return this.req.url ?? '/';
  }

  get method(): string {
    return this.req.method ?? 'GET';
  }

  get path(): string {
    return (this.req.url ?? '/').split('?')[0] ?? '/';
  }

  get query(): string {
    const url = this.req.url ?? '/';
    const i = url.indexOf('?');
    return i === -1 ? '' : url.slice(i + 1);
  }

  text(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.req.on('data', (c) => chunks.push(c));
      this.req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      this.req.on('error', reject);
    });
  }
}

/** Minimal `KozoRequest` for uWS handlers (URL string only). */
export class UwsReqAdapter implements KozoRequest {
  constructor(
    private readonly urlStr: string,
    private readonly rawBody?: string,
  ) {}

  header(_name: string): string | undefined {
    return undefined;
  }

  get url(): string {
    return this.urlStr;
  }

  get method(): string {
    return 'GET';
  }

  get path(): string {
    return this.urlStr.split('?')[0] ?? '/';
  }

  get query(): string {
    const i = this.urlStr.indexOf('?');
    return i === -1 ? '' : this.urlStr.slice(i + 1);
  }

  text(): Promise<string> {
    return Promise.resolve(this.rawBody ?? '');
  }
}
