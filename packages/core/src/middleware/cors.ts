import { cors as honoCors } from 'hono/cors';

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => string | undefined | null);
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
}

/**
 * CORS middleware wrapper
 */
export function cors(options: CorsOptions = {}) {
  return honoCors({
    origin: options.origin || '*',
    allowMethods: options.allowMethods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: options.allowHeaders || ['Content-Type', 'Authorization'],
    exposeHeaders: options.exposeHeaders || [],
    maxAge: options.maxAge || 86400,
    credentials: options.credentials || false
  });
}
