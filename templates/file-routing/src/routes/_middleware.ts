/** Global request logger — applies to all routes under this directory tree. */
export default async function globalLogger(c: any, next: () => Promise<void>) {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${Date.now() - start}ms`);
}
