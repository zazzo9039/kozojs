import type { KozoContext } from '@kozojs/core';

export default async (ctx: KozoContext) => {
  const key = ctx.params.key;
  const cached = await ctx.services.redis.cache.get<string>(key);
  if (cached === null) {
    const value = `generated-at-${new Date().toISOString()}`;
    await ctx.services.redis.cache.set(key, value, 60);
    return { key, value, source: 'miss' };
  }
  return { key, value: cached, source: 'hit' };
};
