/**
 * Run `fn` inside a Drizzle transaction.
 *
 * Intended for **async drivers** (postgres-js, mysql2), which is the kozo-app
 * production target. The synchronous `better-sqlite3` driver does **not** accept
 * async transaction callbacks — use `db.transaction()` with a sync callback there.
 *
 * Falls back to running `fn` directly on `db` when the client has no
 * `.transaction()` method (e.g. mocks / test doubles).
 *
 * @example
 * await runTransaction(db, async (tx) => {
 *   const user = await insertOne(tx, users, { name });
 *   await insertOne(tx, posts, { authorId: user.id });
 * });
 */
export async function runTransaction<T>(
  db: any,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  if (typeof db.transaction === 'function') {
    return db.transaction(fn);
  }
  return fn(db);
}
