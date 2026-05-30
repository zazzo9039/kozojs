/** JWT required for all /api/* routes (registerAuthBeforeLoadRoutes runs before this). */
export default async function apiLogger(c: any, next: () => Promise<void>) {
  await next();
}
