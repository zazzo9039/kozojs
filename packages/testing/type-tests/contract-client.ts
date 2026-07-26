import { createKozo, createRouter, z } from '@kozojs/core';
import {
  createContractTestClient,
  createNativeContractTestClient,
} from '../src/index.js';

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
    (<T>() => T extends TRight ? 1 : 2)
    ? true
    : false;

type Expect<TValue extends true> = TValue;

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const ProblemSchema = z.object({
  detail: z.string(),
});

const app = createKozo()
  .get('/health', {
    response: z.object({ ok: z.literal(true) }),
  }, () => ({ ok: true as const }))
  .get('/users/:id', {
    params: z.object({ id: z.string() }),
    query: z.object({ expand: z.string().optional() }),
    headers: z.object({ 'x-trace-id': z.string().optional() }),
    response: {
      200: UserSchema,
      404: ProblemSchema,
    },
  }, ({ params }) => ({ id: params.id, name: 'Ada' }))
  .post('/users', {
    body: z.object({
      name: z.string(),
      count: z.string().transform(Number),
    }),
    response: {
      201: UserSchema,
    },
  }, ({ body }) => ({ id: String(body.count), name: body.name }));

const client = createContractTestClient(app);

const healthResponse = await client.health.get();
type _HealthBody = Expect<Equal<
  ReturnType<typeof healthResponse.json>,
  { ok: true }
>>;

const detailResponse = await client.users.$id.get({
  params: { id: 'user-1' },
  query: { expand: 'profile' },
  headers: { 'x-trace-id': 'trace-1' },
});

if (detailResponse.status === 200) {
  detailResponse.json().name satisfies string;
} else {
  detailResponse.status satisfies 404;
  detailResponse.json().detail satisfies string;
}

await client.users.post({
  body: { name: 'Ada', count: '2' },
});

// @ts-expect-error path params are required
client.users.$id.get();
// @ts-expect-error params are inferred from the route schema
client.users.$id.get({ params: { id: 123 } });
// @ts-expect-error request body is required
client.users.post();
// @ts-expect-error z.input is used for transformed request values
client.users.post({ body: { name: 'Ada', count: 2 } });
// @ts-expect-error unknown body field
client.users.post({ body: { name: 'Ada', count: '2', admin: true } });
// @ts-expect-error route method does not exist
client.users.delete();

const adminRoutes = createRouter()
  .get('/', {
    headers: z.object({ authorization: z.string() }),
    response: z.object({ role: z.literal('admin') }),
  }, () => ({ role: 'admin' as const }));

const mounted = createKozo().mount('/api/admin', adminRoutes);
const mountedClient = createContractTestClient(mounted);
await mountedClient.api.admin.get({
  headers: { authorization: 'Bearer token' },
});
// @ts-expect-error required header object cannot be omitted
mountedClient.api.admin.get();

const normalized = createKozo().get('/user-profiles/:user-id', {
  params: z.object({ 'user-id': z.string() }),
  response: UserSchema,
}, ({ params }) => ({ id: params['user-id'], name: 'Ada' }));

await createContractTestClient(normalized).userProfiles.$userId.get({
  params: { 'user-id': 'user-1' },
});

const imperative = createKozo();
imperative.get('/hidden-from-types', {}, () => ({ ok: true }));
const imperativeClient = createContractTestClient(imperative);
// @ts-expect-error ignored imperative return values cannot alter the app type
imperativeClient.hiddenFromTypes.get();

const nativeClient = await createNativeContractTestClient(app);
nativeClient.port satisfies number;
await nativeClient.health.get();
await nativeClient.close();
