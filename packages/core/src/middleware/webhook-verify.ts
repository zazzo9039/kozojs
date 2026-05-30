import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';

// ── Types ────────────────────────────────────────────────────────────────

export interface WebhookVerifyOptions {
  /** Shared secret used to compute the HMAC digest. */
  secret: string;
  /**
   * HMAC algorithm. Defaults to `'sha256'`.
   * Any algorithm accepted by `crypto.createHmac()` is valid (e.g. `'sha512'`).
   */
  algorithm?: string;
  /**
   * Name of the HTTP header that carries the signature.
   * Defaults to `'x-webhook-signature'`.
   * The expected format is `sha256=<hex-digest>` (matching GitHub-style webhooks).
   */
  headerName?: string;
}

// ── Middleware ────────────────────────────────────────────────────────────

/**
 * Middleware that verifies the HMAC signature of an incoming webhook request.
 *
 * - Returns **401** when the signature header is missing.
 * - Returns **403** when the signature does not match (uses `timingSafeEqual`
 *   to prevent timing attacks).
 * - Calls `next()` when the signature is valid.
 *
 * @example
 * app.middleware('/webhooks/*',
 *   verifyWebhookSignature({ secret: process.env.WEBHOOK_SECRET! })
 * );
 */
export function verifyWebhookSignature(options: WebhookVerifyOptions) {
  const {
    secret,
    algorithm = 'sha256',
    headerName = 'x-webhook-signature',
  } = options;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const signature = c.req.header(headerName);

    if (!signature) {
      return c.json(
        {
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: `Missing required header: ${headerName}`,
        },
        401,
      );
    }

    // Expected header format: `<algorithm>=<hex-digest>` (e.g. `sha256=abc123…`)
    const prefix = `${algorithm}=`;
    const hexDigest = signature.startsWith(prefix)
      ? signature.slice(prefix.length)
      : signature;

    const body = await c.req.text();
    const expected = createHmac(algorithm, secret).update(body).digest('hex');

    // Constant-time comparison — prevents timing side-channel attacks
    let signaturesMatch: boolean;
    try {
      signaturesMatch = timingSafeEqual(
        Buffer.from(hexDigest, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      // Buffer lengths differ → invalid hex or wrong length → mismatch
      signaturesMatch = false;
    }

    if (!signaturesMatch) {
      return c.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'Webhook signature verification failed',
        },
        403,
      );
    }

    await next();
  };
}
