import { createRequire } from 'node:module';
import { createServer } from 'node:net';

// uWS ships as a CJS native module
const require = createRequire(import.meta.url);
const uWS = require('uWebSockets.js') as any;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '0.0.0.0', () => {
      const port = (srv.address() as any).port as number;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

interface User {
  id: string;
  name: string;
  email: string;
}

const users: User[] = [];

// Pre-serialized static response for GET (zero alloc on hot path)
function serializeUsers(): string {
  return JSON.stringify(users);
}

export async function setupUwsAutocannon(): Promise<{ port: number; server: { close(): void } }> {
  const port = await getFreePort();

  return new Promise((resolve, reject) => {
    const app = uWS.App();

    app.get('/api/health', (res: any) => {
      const body = JSON.stringify({ status: 'ok', timestamp: Date.now() });
      res.cork(() => {
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(body);
      });
    });

    app.get('/api/users', (res: any) => {
      const body = serializeUsers();
      res.cork(() => {
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(body);
      });
    });

    app.post('/api/users', (res: any) => {
      let body = '';
      let aborted = false;
      res.onAborted(() => { aborted = true; });
      res.onData((chunk: ArrayBuffer, isLast: boolean) => {
        if (aborted) return;
        if (chunk.byteLength > 0) body += Buffer.from(chunk).toString('utf8');
        if (isLast) {
          try {
            const data = JSON.parse(body);
            const user: User = { id: Date.now().toString(), ...data };
            users.push(user);
            const out = JSON.stringify(user);
            res.cork(() => {
              res.writeStatus('201 Created');
              res.writeHeader('Content-Type', 'application/json');
              res.end(out);
            });
          } catch {
            res.cork(() => { res.writeStatus('400 Bad Request'); res.end('{}'); });
          }
        }
      });
    });

    let token: unknown = null;
    app.listen(port, (listenToken: unknown) => {
      if (!listenToken) { reject(new Error(`uWS failed to listen on :${port}`)); return; }
      token = listenToken;
      resolve({
        port,
        server: {
          close() { if (token) uWS.us_listen_socket_close(token); },
        },
      });
    });
  });
}
