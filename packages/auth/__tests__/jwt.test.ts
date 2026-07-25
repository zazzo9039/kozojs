/**
 * JWT Authentication Tests
 * 
 * Unit tests for token decode, expiry, invalid signature
 * Integration tests for 401 on missing/expired token
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createJWT, authenticateJWT, decodeJWT } from '../src/index.js';

// Test constants
const TEST_SECRET = 'test-secret-key-for-testing-only';

describe('JWT Authentication', () => {
  describe('createJWT', () => {
    it('should create a valid JWT token', async () => {
      const payload = { sub: 'user123', name: 'Test User' };
      const token = await createJWT(payload, TEST_SECRET);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should create a token with expiration', async () => {
      const payload = { sub: 'user123' };
      const token = await createJWT(payload, TEST_SECRET, { expiresIn: '1h' });
      
      expect(token).toBeDefined();
      const decoded = decodeJWT(token);
      expect(decoded).toBeDefined();
      expect(decoded?.exp).toBeDefined();
    });

    it('should use specified algorithm', async () => {
      const payload = { sub: 'user123' };
      const token = await createJWT(payload, TEST_SECRET, { algorithm: 'HS384' });
      
      const decoded = decodeJWT(token);
      expect(decoded).toBeDefined();
    });
  });

  describe('decodeJWT', () => {
    it('should decode a valid JWT without verification', async () => {
      const payload = { sub: 'user123', role: 'admin' };
      const token = await createJWT(payload, TEST_SECRET);
      
      const decoded = decodeJWT(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.sub).toBe('user123');
      expect(decoded?.role).toBe('admin');
    });

    it('should return null for invalid token', () => {
      const decoded = decodeJWT('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for malformed JWT', () => {
      const decoded = decodeJWT('not.a.jwt');
      expect(decoded).toBeNull();
    });
  });

  describe('decodeTokenPayload', () => {
    it('matches decodeJWT for the same token', async () => {
      const { decodeTokenPayload } = await import('../src/index.js');
      const token = await createJWT({ sub: 'u1', name: 'José' }, TEST_SECRET);
      expect(decodeTokenPayload(token)).toEqual(decodeJWT(token));
    });
  });

  describe('authenticateJWT middleware', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
    });

    it('should allow valid JWT token', async () => {
      const payload = { sub: 'user123', name: 'Test User' };
      const token = await createJWT(payload, TEST_SECRET);
      
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/api/test', (c) => {
        const user = c.get('user');
        return c.json({ user });
      });

      const res = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.sub).toBe('user123');
    });

    it('should return 401 for missing token', async () => {
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/api/test', (c) => c.json({ ok: true }));

      const res = await app.request('/api/test');
      
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.title).toBe('Unauthorized');
      expect(data.detail).toBe('Missing authentication token');
    });

    it('should return 401 for invalid token', async () => {
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/api/test', (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        headers: { Authorization: 'Bearer invalid-token' }
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.title).toBe('Unauthorized');
    });

    it('should return 401 for expired token', async () => {
      // Create a token that expires immediately
      const payload = { sub: 'user123' };
      const token = await createJWT(payload, TEST_SECRET, { expiresIn: '-1s' });
      
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/api/test', (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.detail).toBe('Token has expired');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = { sub: 'user123' };
      const token = await createJWT(payload, 'wrong-secret-that-is-at-least-32-bytes');
      
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/api/test', (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.detail).toBe('Invalid token signature');
    });

    it('should skip non-/api routes by default', async () => {
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/health', (c) => c.json({ status: 'ok' }));

      const res = await app.request('/health');
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('should protect all routes when prefix is empty', async () => {
      app.use('/*', authenticateJWT(TEST_SECRET, { prefix: '' }));
      app.get('/health', (c) => c.json({ ok: true }));

      const res = await app.request('/health');
      
      expect(res.status).toBe(401);
    });

    it('should use custom prefix', async () => {
      app.use('/*', authenticateJWT(TEST_SECRET, { prefix: '/v1' }));
      app.get('/v1/test', (c) => c.json({ ok: true }));
      app.get('/api/test', (c) => c.json({ ok: true }));

      // /v1/test should be protected
      const res1 = await app.request('/v1/test');
      expect(res1.status).toBe(401);

      // /api/test should NOT be protected (different prefix)
      const res2 = await app.request('/api/test');
      expect(res2.status).toBe(200);
    });

    it('should use custom token extractor', async () => {
      const payload = { sub: 'user123' };
      const token = await createJWT(payload, TEST_SECRET);
      
      app.use('/*', authenticateJWT(TEST_SECRET, {
        getToken: (c) => c.req.header('X-Custom-Token')
      }));
      app.get('/api/test', (c) => {
        const user = c.get('user');
        return c.json({ user });
      });

      // Should work with custom header
      const res1 = await app.request('/api/test', {
        headers: { 'X-Custom-Token': token }
      });
      expect(res1.status).toBe(200);

      // Should fail with Authorization header (not checked)
      const res2 = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(res2.status).toBe(401);
    });

    it('should validate expected claims', async () => {
      const payload = { sub: 'user123', role: 'admin' };
      const token = await createJWT(payload, TEST_SECRET);
      
      app.use('/*', authenticateJWT(TEST_SECRET, {
        expectedClaims: { role: 'admin' }
      }));
      app.get('/api/test', (c) => c.json({ ok: true }));

      // Should work with matching claim
      const res1 = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(res1.status).toBe(200);
    });

    it('should reject token with non-matching expected claims', async () => {
      const payload = { sub: 'user123', role: 'user' };
      const token = await createJWT(payload, TEST_SECRET);
      
      app.use('/*', authenticateJWT(TEST_SECRET, {
        expectedClaims: { role: 'admin' }
      }));
      app.get('/api/test', (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.detail).toBe('Invalid claim: role');
    });

    it('should set user on context', async () => {
      const payload = { sub: 'user123', email: 'test@example.com' };
      const token = await createJWT(payload, TEST_SECRET);
      
      app.use('/*', authenticateJWT(TEST_SECRET));
      app.get('/api/user', (c) => {
        const user = c.get('user');
        return c.json({ 
          sub: user?.sub, 
          email: user?.email 
        });
      });

      const res = await app.request('/api/user', {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sub).toBe('user123');
      expect(data.email).toBe('test@example.com');
    });

    it('should reject token with invalid algorithm', async () => {
      const payload = { sub: 'user123' };
      // Create token with HS384
      const token = await createJWT(payload, TEST_SECRET, { algorithm: 'HS384' });
      
      // Only allow HS256
      app.use('/*', authenticateJWT(TEST_SECRET, {
        allowedAlgorithms: ['HS256']
      }));
      app.get('/api/test', (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect(res.status).toBe(401);
    });
  });
});
