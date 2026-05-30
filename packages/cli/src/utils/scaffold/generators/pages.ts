export function generateAppTsx(projectName: string, auth: boolean): string {
  return `import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Users, FileText, CheckSquare, Server, Sun, Moon${auth ? ', LogOut' : ''} } from 'lucide-react';
import { Toaster } from 'sonner';
${auth ? "import { getToken, clearToken } from '@/lib/api';" : ''}
import { useUIStore } from '@/store/ui';
import { useThemeStore } from '@/store/theme';
import PreloadSpinner from '@/components/PreloadSpinner';
${auth ? "import Login from './pages/Login';" : ''}
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import PostsPage from './pages/Posts';
import TasksPage from './pages/Tasks';

// ── Routing ─────────────────────────────────────────────────────────────────
type AppPage = 'dashboard' | 'users' | 'posts' | 'tasks';
const APP_PAGES: AppPage[] = ['dashboard', 'users', 'posts', 'tasks'];
const NAV_SPINNER_MS = 300;

function parseRoute(pathname: string): AppPage {
  const clean = pathname.replace(/\\/+$/, '') || '/';
  if (clean.startsWith('/app/')) {
    const seg = clean.replace('/app/', '') as AppPage;
    return APP_PAGES.includes(seg) ? seg : 'dashboard';
  }
  return 'dashboard';
}

function buildUrl(page: AppPage): string {
  return page === 'dashboard' ? '/app' : \`/app/\${page}\`;
}

const PAGE_TITLES: Record<AppPage, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  posts: 'Posts',
  tasks: 'Tasks',
};

export default function App({ initialPath = '/' }: { initialPath?: string }) {
  const initial = useMemo(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : initialPath;
    return parseRoute(pathname);
  }, [initialPath]);

  const [page, setPage] = useState<AppPage>(initial);
${auth ? `  const [token, setToken] = useState<string | null>(() => getToken());` : ''}
  const queryClient = useQueryClient();
  const sidebarOpen   = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setGlobalLoading = useUIStore((s) => s.setGlobalLoading);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // All hooks must be declared before any early return
  const navigate = useCallback((p: AppPage) => {
    if (p === page) return;
    if (typeof window !== 'undefined') window.history.pushState(null, '', buildUrl(p));
    setGlobalLoading(true);
    setTimeout(() => { setPage(p); setGlobalLoading(false); }, NAV_SPINNER_MS);
  }, [page, setGlobalLoading]);

  // Sync browser back/forward
  useEffect(() => {
    const onPop = () => setPage(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Close sidebar on wider screens
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    if (mq.matches) setSidebarOpen(false);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setSidebarOpen]);

  // Update <title>
  useEffect(() => { document.title = \`\${PAGE_TITLES[page]} | ${projectName}\`; }, [page]);
${auth ? `
  const handleLogin = (t: string) => setToken(t);
  const handleLogout = () => {
    clearToken();
    setToken(null);
    queryClient.clear();
  };

  if (!token) return <Login onLogin={handleLogin} />;
` : ''}

  const nav = [
    { id: 'dashboard' as AppPage, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users' as AppPage, label: 'Users',     icon: Users },
    { id: 'posts' as AppPage, label: 'Posts',     icon: FileText },
    { id: 'tasks' as AppPage, label: 'Tasks',     icon: CheckSquare },
  ];

  const sidebar = (
    <aside
      className={\`flex flex-col h-full transition-transform md:translate-x-0 \${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }\`}
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', width: '224px' }}
    >
      <div className="flex items-center gap-2 p-5 pb-4">
        <Server className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--fg)' }}>${projectName}</span>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { navigate(id); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={page === id
              ? { background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active-fg)' }
              : { color: 'var(--sidebar-fg)' }
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--sidebar-fg)' }}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />
          }
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
${auth ? `        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:text-red-400"
          style={{ color: 'var(--sidebar-fg)' }}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
` : ''}      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <PreloadSpinner />
      <Toaster position="bottom-right" richColors />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile, static on desktop */}
      <div className="hidden md:flex flex-col" style={{ width: '224px', flexShrink: 0 }}>
        {sidebar}
      </div>
      <div
        className={\`fixed inset-y-0 left-0 z-50 flex flex-col md:hidden transition-transform \${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }\`}
      >
        {sidebar}
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile topbar */}
        <header className="flex md:hidden items-center gap-3 px-4 h-14 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}>
          <button onClick={toggleSidebar} className="p-1.5 rounded-md"
            style={{ color: 'var(--fg-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>
            {PAGE_TITLES[page]}
          </span>
        </header>
        <main className="flex-1 overflow-auto p-6 sm:p-8">
          {page === 'dashboard' && <Dashboard />}
          {page === 'users'     && <UsersPage />}
          {page === 'posts'     && <PostsPage />}
          {page === 'tasks'     && <TasksPage />}
        </main>
      </div>
    </div>
  );
}
`;
}

export function generateLoginPage(): string {
  return `import { useState, FormEvent } from 'react';
import { Server, Loader2 } from 'lucide-react';
import { apiFetch, setToken } from '@/lib/api';

interface Props {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 200 && res.data.token) {
        setToken(res.data.token);
        onLogin(res.data.token);
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Connection failed — is the API running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <Server className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Sign in</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>to your kozo dashboard</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--fg-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--fg-muted)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
              required
            />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--destructive)' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>
        <p className="text-center text-xs mt-4" style={{ color: 'var(--fg-subtle)' }}>
          Demo: admin@demo.com / admin123
        </p>
      </div>
    </div>
  );
}
`;
}

export function generateDashboardPage(): string {
  return `import { useQuery } from '@tanstack/react-query';
import { healthQuery, statsQuery } from '@/lib/queries';
import { Users, FileText, CheckSquare, Zap } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--fg-muted)' }}>{label}</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--fg)' }}>{value}</p>
          {sub && <p className="text-xs mt-1" style={{ color: 'var(--fg-subtle)' }}>{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: accent + '22', color: accent }}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-start justify-between">
              <div><Skeleton className="h-3 w-16 mb-3" /><Skeleton className="h-9 w-20 mb-2" /></div>
              <Skeleton className="w-10 h-10 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: health } = useQuery(healthQuery);
  const { data: stats, isLoading } = useQuery(statsQuery);

  const uptime = health?.uptime;
  const uptimeStr = uptime !== undefined
    ? uptime > 3600 ? \`\${Math.floor(uptime / 3600)}h \${Math.floor((uptime % 3600) / 60)}m\`
    : uptime > 60 ? \`\${Math.floor(uptime / 60)}m \${Math.floor(uptime % 60)}s\`
    : \`\${Math.floor(uptime)}s\`
    : '—';

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>Server overview and statistics</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        <StatCard label="Users"  value={stats?.users ?? '—'} icon={Users}       accent="var(--accent-2)" />
        <StatCard label="Posts"  value={stats?.posts ?? '—'}
          sub={stats ? \`\${stats.publishedPosts} published\` : undefined}
          icon={FileText}    accent="#c084fc" />
        <StatCard label="Tasks"  value={stats?.tasks ?? '—'}
          sub={stats ? \`\${stats.completedTasks} completed\` : undefined}
          icon={CheckSquare} accent="#34d399" />
        <StatCard label="Uptime" value={uptimeStr}
          sub={health?.version ? \`v\${health.version}\` : undefined}
          icon={Zap}         accent="#fbbf24" />
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>API Status</h3>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
            GET /api/health
          </code>
          <span className="px-2 py-0.5 rounded text-xs font-semibold"
            style={health?.status === 'ok'
              ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
              : { background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }
            }>
            {health?.status ?? 'pending'}
          </span>
        </div>
      </div>
    </div>
  );
}
`;
}

export function generateUsersPage(): string {
  return `import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersQuery, type User } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

function UsersSkeleton() {
  return (
    <div>
      <div className="mb-6"><Skeleton className="h-8 w-32 mb-2" /><Skeleton className="h-4 w-24" /></div>
      <div className="card mb-4"><Skeleton className="h-5 w-28 mb-3" /><div className="flex gap-3"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-20" /></div></div>
      <div className="card">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
            <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: users = [], isLoading } = useQuery(usersQuery);

  const createUser = async () => {
    if (!form.name || !form.email) { setError('Name and email required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) });
      if (res.status >= 400) throw new Error('Failed');
      setForm({ name: '', email: '' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notify('success', 'User created');
    } catch { setError('Failed to create user'); notify('error', 'Failed to create user'); }
    finally { setLoading(false); }
  };

  const deleteUser = async (id: string | number) => {
    await apiFetch(\`/api/users/\${id}\`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    notify('success', 'User deleted');
  };

  if (isLoading) return <UsersSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Users</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{users.length} total</p>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>Add User</h3>
        <div className="flex gap-3">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <input
            placeholder="email@example.com"
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <button onClick={() => void createUser()} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--destructive)' }}>{error}</p>}
      </div>

      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>No users yet. Add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--fg)' }}>{user.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--fg-muted)' }}>{user.email}</td>
                  <td className="px-4 py-3">
                    {user.role && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={user.role === 'admin'
                          ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
                          : { background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => void deleteUser(user.id)}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--fg-subtle)' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
`;
}

export function generatePostsPage(): string {
  return `import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { postsQuery, type Post } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { Plus, Trash2, Loader2, Globe, Lock } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

function PostsSkeleton() {
  return (
    <div>
      <div className="mb-6"><Skeleton className="h-8 w-28 mb-2" /><Skeleton className="h-4 w-20" /></div>
      <div className="card mb-4"><Skeleton className="h-5 w-24 mb-3" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-20 w-full" /></div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card mb-3"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-full" /></div>
      ))}
    </div>
  );
}

export default function PostsPage() {
  const queryClient = useQueryClient();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState({ title: '', content: '', published: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: posts = [], isLoading } = useQuery(postsQuery);

  const createPost = async () => {
    if (!form.title) { setError('Title required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(form) });
      if (res.status >= 400) throw new Error('Failed');
      setForm({ title: '', content: '', published: false });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      notify('success', 'Post created');
    } catch { setError('Failed to create post'); notify('error', 'Failed to create post'); }
    finally { setLoading(false); }
  };

  const deletePost = async (id: string | number) => {
    await apiFetch(\`/api/posts/\${id}\`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    notify('success', 'Post deleted');
  };

  if (isLoading) return <PostsSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Posts</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{posts.length} total</p>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>New Post</h3>
        <div className="space-y-3">
          <input
            placeholder="Post title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <textarea
            placeholder="Content (optional)"
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--fg-muted)' }}>
              <input type="checkbox" checked={form.published}
                onChange={e => setForm({ ...form, published: e.target.checked })} />
              Publish immediately
            </label>
            <button onClick={() => void createPost()} disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--destructive)' }}>{error}</p>}
      </div>

      <div className="space-y-3">
        {posts.length === 0 ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No posts yet. Create one above.</div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="card flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {post.published
                    ? <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#34d399' }} />
                    : <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--fg-subtle)' }} />
                  }
                  <h3 className="font-semibold truncate text-sm" style={{ color: 'var(--fg)' }}>{post.title}</h3>
                </div>
                {post.content && (
                  <p className="text-sm line-clamp-2 mt-0.5" style={{ color: 'var(--fg-muted)' }}>{post.content}</p>
                )}
              </div>
              <button onClick={() => void deletePost(post.id)}
                className="ml-3 p-1.5 rounded transition-colors flex-shrink-0"
                style={{ color: 'var(--fg-subtle)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
`;
}

export function generateTasksPage(): string {
  return `import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksQuery, type Task } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { Plus, Trash2, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

const PRIORITY_STYLE: Record<string, { background: string; color: string }> = {
  high:   { background: 'rgba(239,68,68,0.15)',  color: '#f87171' },
  medium: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  low:    { background: 'var(--bg-subtle)',       color: 'var(--fg-muted)' },
};

function TasksSkeleton() {
  return (
    <div>
      <div className="mb-6"><Skeleton className="h-8 w-28 mb-2" /><Skeleton className="h-4 w-24" /></div>
      <div className="card mb-4"><Skeleton className="h-5 w-24 mb-3" /><div className="flex gap-3"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-20" /></div></div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 mb-2">
          <Skeleton className="w-5 h-5 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState({ title: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: tasks = [], isLoading } = useQuery(tasksQuery);

  const createTask = async () => {
    if (!form.title) { setError('Title required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(form) });
      if (res.status >= 400) throw new Error('Failed');
      setForm({ title: '', priority: 'medium' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      notify('success', 'Task created');
    } catch { setError('Failed to create task'); notify('error', 'Failed to create task'); }
    finally { setLoading(false); }
  };

  const toggleTask = async (id: string | number) => {
    await apiFetch(\`/api/tasks/\${id}/toggle\`, { method: 'PATCH' });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const deleteTask = async (id: string | number) => {
    await apiFetch(\`/api/tasks/\${id}\`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    notify('success', 'Task deleted');
  };

  const done = tasks.filter(t => t.completed).length;

  if (isLoading) return <TasksSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Tasks</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{done}/{tasks.length} completed</p>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>New Task</h3>
        <div className="flex gap-3">
          <input
            placeholder="Task title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') void createTask(); }}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <select
            value={form.priority}
            onChange={e => setForm({ ...form, priority: e.target.value as 'low' | 'medium' | 'high' })}
            className="px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button onClick={() => void createTask()} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--destructive)' }}>{error}</p>}
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No tasks yet. Add one above.</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="card flex items-center justify-between py-3"
              style={{ opacity: task.completed ? 0.65 : 1 }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button onClick={() => void toggleTask(task.id)}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: task.completed ? '#34d399' : 'var(--fg-subtle)' }}>
                  {task.completed
                    ? <CheckCircle2 className="w-5 h-5" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>
                <span className={\`text-sm font-medium truncate \${task.completed ? 'line-through' : ''}\`}
                  style={{ color: task.completed ? 'var(--fg-subtle)' : 'var(--fg)' }}>
                  {task.title}
                </span>
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.low}>
                  {task.priority}
                </span>
              </div>
              <button onClick={() => void deleteTask(task.id)}
                className="ml-3 p-1.5 rounded transition-colors flex-shrink-0"
                style={{ color: 'var(--fg-subtle)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
`;
}

