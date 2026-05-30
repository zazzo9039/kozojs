import { z } from 'zod';

export const meta = { auth: false };

export const schema = {
  response: z.object({ page: z.string() }),
};

export default () => ({ page: 'home' });
