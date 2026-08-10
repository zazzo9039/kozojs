import { createKozoClient } from '../generated/api.js';

const api = createKozoClient();

async function checkGeneratedContract(): Promise<void> {
  const detail = await api.users.$id.get({
    params: { id: 'user-1' },
  });

  if (detail.status === 200) {
    detail.body.email satisfies string;
  } else {
    detail.body.detail satisfies string;
  }

  await api.users.post({
    body: {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct-horse-battery-staple',
    },
  });

  // @ts-expect-error Path parameters are required by the generated route.
  await api.users.$id.get();

  // @ts-expect-error The generated route tree only exposes declared methods.
  await api.users.$id.delete({ params: { id: 'user-1' } });

  await api.users.post({
    // @ts-expect-error The request body must satisfy the route's Zod input type.
    body: { name: 'Ada' },
  });
}

void checkGeneratedContract;
