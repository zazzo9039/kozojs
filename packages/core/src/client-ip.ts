// ============================================================================
// Client IP resolution — the single source of truth for "who is this request".
// ============================================================================
//
// Used by rate limiting today (see middleware/rate-limit.ts). The app-level
// `trustProxy` option (S2) is expected to build on this same resolver rather
// than introduce a second hop-counting implementation.
//
// The security-critical rule lives here: `x-forwarded-for` is client-writable,
// so it is consulted ONLY when the application explicitly opts in via
// `trustProxy`, and even then the trusted hop is counted from the RIGHT — the
// entry appended by the nearest trusted proxy — never `split(',')[0]`, which is
// the value the client itself wrote.

/**
 * Proxy trust configuration.
 * - `false` (default): never read forwarding headers; key on the connection.
 * - `true`: exactly one trusted proxy in front of the app.
 * - `n`: `n` trusted proxies in front of the app.
 */
export type TrustProxy = boolean | number;

/** Minimal transport-agnostic view needed to identify a client. */
export interface ClientAddressSource {
  /** The connection (socket / uWS) remote address, or '' when unavailable. */
  connectionAddress: string;
  /** Case-insensitive header lookup. */
  header(name: string): string | undefined;
}

/** Normalize `trustProxy` to the number of trusted hops (0 ⇒ do not trust headers). */
function trustedHops(trustProxy: TrustProxy): number {
  if (trustProxy === true) return 1;
  if (typeof trustProxy === 'number' && Number.isInteger(trustProxy) && trustProxy > 0) {
    return trustProxy;
  }
  return 0; // false, 0, negative, non-integer → do not trust forwarding headers
}

/**
 * Resolve the client IP used as a rate-limit / audit identity.
 *
 * With `trustProxy` falsy the connection address is authoritative and no header
 * can change it. With `trustProxy = n` the client is the entry `n` positions
 * from the right of `x-forwarded-for` (the hop the nearest trusted proxy
 * added); a shorter-than-expected header means the chain was truncated or the
 * proxy count is wrong, so we fall back to the connection rather than to a
 * client-writable hop. `x-real-ip` is honored only as a last resort under a
 * trusted proxy.
 *
 * Returns `'anonymous'` only when there is genuinely no address to key on —
 * which under a real `listen()` / `nativeListen()` transport does not happen,
 * because the socket address is always present. (The old default keyed *every*
 * client on `'anonymous'` by never consulting the connection at all.)
 */
export function resolveClientIp(source: ClientAddressSource, trustProxy: TrustProxy): string {
  const connection = source.connectionAddress.trim();
  const depth = trustedHops(trustProxy);

  if (depth > 0) {
    const xff = source.header('x-forwarded-for');
    if (xff) {
      const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
      if (hops.length >= depth) return hops[hops.length - depth];
      // Fewer hops than trusted proxies: header is untrustworthy here.
    }
    const realIp = source.header('x-real-ip')?.trim();
    if (realIp) return realIp;
  }

  return connection || 'anonymous';
}
