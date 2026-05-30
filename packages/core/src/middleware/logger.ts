import type { Context, Next } from 'hono';

export interface LoggerOptions {
  prefix?: string;
  colorize?: boolean;
}

/**
 * Strip characters that could corrupt structured log output or inject false
 * log lines: newline (LF/CR), tab, and the ESC byte used for ANSI sequences.
 */
export function sanitizeForLog(input: string): string {
  return input
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\x1b/g, '\\x1b');
}

/**
 * Request logger middleware
 */
export function logger(options: LoggerOptions = {}) {
  const { prefix = '🌐', colorize = true } = options;

  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = sanitizeForLog(c.req.method);
    const path = sanitizeForLog(c.req.path);

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    const statusColor = status >= 500 ? '🔴' : status >= 400 ? '🟡' : '🟢';
    const log = `${prefix} ${method.padEnd(6)} ${path} ${statusColor} ${status} ${duration}ms`;
    
    console.log(log);
  };
}
