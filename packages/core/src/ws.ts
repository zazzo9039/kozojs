// ============================================================================
// Kozo WebSocket — native uWS WebSocket support
// ============================================================================

// ── User-facing WebSocket handle ─────────────────────────────────────────────

/**
 * A WebSocket connection handle exposed to user handlers.
 *
 * Wraps the underlying uWebSockets.js WebSocket with a clean, type-safe API.
 * Supports uWS-native topics for efficient in-process pub/sub.
 *
 * For cross-instance broadcasting, combine with `@kozojs/redis` pub/sub.
 */
export interface KozoWebSocket<T = unknown> {
  /** Send a message to this client. */
  send(data: string | ArrayBuffer | Uint8Array, isBinary?: boolean): void;
  /** Close the connection. */
  close(code?: number, reason?: string): void;

  // ── uWS-native topics (in-process pub/sub) ──────────────────────────
  /** Subscribe this socket to a topic. */
  subscribe(topic: string): void;
  /** Unsubscribe from a topic. */
  unsubscribe(topic: string): void;
  /** Publish a message to all sockets subscribed to a topic. */
  publish(topic: string, data: string | ArrayBuffer | Uint8Array, isBinary?: boolean): void;
  /** Check if this socket is subscribed to a topic. */
  isSubscribed(topic: string): boolean;

  /** Remote IP address. */
  readonly remoteAddress: string;
  /** Per-connection user data (set in `upgrade`, available in all callbacks). */
  data: T;
}

// ── Handler definition ───────────────────────────────────────────────────────

/** Upgrade request info passed to the optional `upgrade` callback. */
export interface WsUpgradeRequest {
  url: string;
  query: string;
  headers: Record<string, string>;
}

/**
 * WebSocket route handler — lifecycle callbacks for a WS endpoint.
 *
 * @typeParam T  User data type attached to each connection (set via `upgrade`).
 *
 * @example
 * app.ws<{ userId: string }>('/ws/chat', {
 *   upgrade(req) {
 *     const token = req.headers['authorization'];
 *     const userId = verifyToken(token);
 *     if (!userId) return false; // reject
 *     return { userId };         // attached as ws.data
 *   },
 *   open(ws) {
 *     ws.subscribe('chat');
 *   },
 *   message(ws, data) {
 *     ws.publish('chat', data);
 *   },
 * });
 */
export interface WebSocketHandler<T = unknown> {
  /** Called when a new connection is established. */
  open?(ws: KozoWebSocket<T>): void | Promise<void>;
  /** Called when a message is received. */
  message?(ws: KozoWebSocket<T>, data: string | ArrayBuffer, isBinary: boolean): void | Promise<void>;
  /** Called when the connection is closed. */
  close?(ws: KozoWebSocket<T>, code: number, reason: ArrayBuffer): void | Promise<void>;
  /** Called when send backpressure drains. */
  drain?(ws: KozoWebSocket<T>): void;

  /**
   * Upgrade hook — runs before the HTTP→WS upgrade.
   *
   * Return user data to attach to the connection, or `false` to reject (401).
   * Can be async (e.g. for JWT verification).
   */
  upgrade?(req: WsUpgradeRequest): T | false | Promise<T | false>;

  /** Max message size in bytes (default: 1 MB). */
  maxPayloadLength?: number;
  /** Idle timeout in seconds (default: 120). 0 = disabled. */
  idleTimeout?: number;
}

// ── Internal route entry ─────────────────────────────────────────────────────

/** Stored by Kozo.ws() and consumed by createUwsServer(). */
export interface WsRouteEntry {
  path: string;
  handler: WebSocketHandler<any>;
}
