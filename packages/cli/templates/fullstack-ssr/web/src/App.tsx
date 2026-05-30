export function App({ message }: { message: string }) {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>{{PROJECT_NAME}}</h1>
      <p>{message}</p>
      <p>
        API: <code>GET /api/health</code>, <code>GET /api/hello?name=Kozo</code>
      </p>
    </main>
  );
}
