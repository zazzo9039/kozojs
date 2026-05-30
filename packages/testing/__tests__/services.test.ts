import { describe, it, expect } from 'vitest';
import { createKozo } from '@kozojs/core';
import { createTestClient, createTestApp } from '../src/index.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('services — typed services via createTestApp', () => {
  it('services are accessible in handler via ctx.services', async () => {
    const db = {
      users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      findAll() { return this.users; },
    };

    const client = createTestApp({ services: { db } });
    client.app.get('/users', {}, ({ services }) => {
      return { users: services.db.findAll() };
    });

    const res = await client.get('/users');
    expect(res.status).toBe(200);
    expect(res.json<any>().users).toHaveLength(2);
    expect(res.json<any>().users[0].name).toBe('Alice');
  });

  it('services are accessible via createTestClient too', async () => {
    const counter = { value: 0 };
    const app = createKozo({ services: { counter } });
    app.post('/increment', {}, ({ services }) => {
      services.counter.value++;
      return { count: services.counter.value };
    });

    const client = createTestClient(app);
    await client.post('/increment');
    const res = await client.post('/increment');
    expect(res.json<any>().count).toBe(2);
  });
});

describe('services — app reference', () => {
  it('createTestClient preserves exact app instance', () => {
    const app = createKozo();
    const client = createTestClient(app);
    expect(client.app).toBe(app);
  });

  it('createTestApp exposes the created app', () => {
    const client = createTestApp();
    expect(client.app).toBeDefined();
    expect(typeof client.app.get).toBe('function');
    expect(typeof client.app.post).toBe('function');
  });
});

describe('services — default (no config)', () => {
  it('createTestApp without config works', async () => {
    const client = createTestApp();
    client.app.get('/ok', {}, () => ({ status: 'ok' }));

    const res = await client.get('/ok');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
