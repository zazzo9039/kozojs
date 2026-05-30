import {
  createKozo, z,
  // Schema helpers (zero boilerplate)
  paginationSchema, uuidParams, deletedSchema, timestamps,
  // Utilities
  paginate, uuid,
  // Errors (throwable — caught automatically by Kozo)
  NotFoundError, UnauthorizedError, ConflictError,
  // Type helper
  type Infer,
} from '@kozojs/core';

// ============================================
// SCHEMI ZOD — definiti una volta al boot
// ============================================

// Schema base per User (timestamps inclusi automaticamente)
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(50),
  role: z.enum(['user', 'admin']).default('user'),
}).merge(timestamps);

// Schema per creare un nuovo user (senza campi auto-generati)
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  role: z.enum(['user', 'admin']).optional(),
});

// Schema per aggiornare user
const UpdateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

// Schema per Post (timestamps inclusi automaticamente)
const PostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  authorId: z.string().uuid(),
  published: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
}).merge(timestamps);

// Schema con autore incluso
const PostWithAuthorSchema = PostSchema.extend({
  author: UserSchema,
});

// Schema per creare post
const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  published: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// Filtri posts
const PostFiltersSchema = z.object({
  published: z.coerce.boolean().optional(),
  authorId: z.string().uuid().optional(),
  tag: z.string().optional(),
});

// Schema per login
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// ============================================
// TIPI — Infer<T> al posto di z.infer<typeof ...>
// ============================================

type User = Infer<typeof UserSchema>;
type Post = Infer<typeof PostSchema>;

// ============================================
// MOCK DATA
// ============================================

const users: User[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'admin@kozo.dev',
    name: 'Admin User',
    role: 'admin',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'john@example.com',
    name: 'John Doe',
    role: 'user',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
];

const posts: Post[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440010',
    title: 'Welcome to Kozo Framework',
    content: 'This is the first post in our amazing framework...',
    authorId: '550e8400-e29b-41d4-a716-446655440000',
    published: true,
    tags: ['framework', 'typescript', 'backend'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440011',
    title: 'Zod Native Integration',
    content: 'Learn how Kozo integrates Zod for maximum performance...',
    authorId: '550e8400-e29b-41d4-a716-446655440001',
    published: true,
    tags: ['zod', 'validation', 'performance'],
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  },
];

// ============================================
// INIZIALIZZAZIONE KOZO APP
// ============================================

const app = createKozo({
  port: 3000,
  openapi: {
    info: {
      title: 'Kozo Mock API',
      version: '1.0.0',
      description: 'Complete example showcasing all Kozo Framework features',
    },
    servers: [{ url: 'http://localhost:3000' }],
  },
});

// ============================================
// HEALTH CHECK — schema opzionale, niente {}
// ============================================

app.get('/health', (c) => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  uptime: process.uptime(),
}));

// ============================================
// AUTH ROUTES — app.group() per prefisso comune
// ============================================

app.group('/auth', (r) => {
  // Login
  r.post('/login', {
    body: LoginSchema,
    response: z.object({ success: z.boolean(), token: z.string(), user: UserSchema }),
  }, (c) => {
    const user = users.find(u => u.email === c.body.email);
    if (!user) throw new UnauthorizedError('Invalid credentials');

    return { success: true, token: `mock_jwt_${user.id}_${Date.now()}`, user };
  });

  // Me endpoint
  r.get('/me', { response: UserSchema }, (c) => users[0]);
});

// ============================================
// USER ROUTES — group + uuidParams + paginate
// ============================================

app.group('/users', (r) => {
  // Lista con paginazione built-in
  r.get('/', { query: paginationSchema }, (c) =>
    paginate(users, c.query.page, c.query.limit),
  );

  // Dettaglio — uuidParams invece di z.object({ id: z.string().uuid() })
  r.get('/:id', { params: uuidParams, response: UserSchema }, (c) => {
    const user = users.find(u => u.id === c.params.id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  });

  // Crea — ConflictError invece di c.json({error:...}, 409)
  r.post('/', { body: CreateUserSchema, response: UserSchema }, (c) => {
    if (users.find(u => u.email === c.body.email)) {
      throw new ConflictError('Email already exists');
    }

    const newUser: User = {
      id: uuid(),                              // uuid() built-in
      email: c.body.email,
      name: c.body.name,
      role: c.body.role || 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.push(newUser);
    return newUser;
  });

  // Aggiorna
  r.put('/:id', { params: uuidParams, body: UpdateUserSchema, response: UserSchema }, (c) => {
    const user = users.find(u => u.id === c.params.id);
    if (!user) throw new NotFoundError('User not found');

    if (c.body.name) user.name = c.body.name;
    if (c.body.role) user.role = c.body.role;
    user.updatedAt = new Date();

    return user;
  });

  // Elimina — deletedSchema built-in
  r.delete('/:id', { params: uuidParams, response: deletedSchema }, (c) => {
    const index = users.findIndex(u => u.id === c.params.id);
    if (index === -1) throw new NotFoundError('User not found');

    users.splice(index, 1);
    return { success: true, deletedId: c.params.id };
  });
});

// ============================================
// POST ROUTES — group + filtri + paginate
// ============================================

app.group('/posts', (r) => {
  // Lista con filtri e paginazione
  r.get('/', {
    query: paginationSchema.merge(PostFiltersSchema),
  }, (c) => {
    const { page, limit, published, authorId, tag } = c.query;

    let filtered = posts;
    if (published !== undefined) filtered = filtered.filter(p => p.published === published);
    if (authorId)                filtered = filtered.filter(p => p.authorId === authorId);
    if (tag)                     filtered = filtered.filter(p => p.tags.includes(tag));

    const withAuthors = filtered.map(post => ({
      ...post,
      author: users.find(u => u.id === post.authorId)!,
    }));

    return paginate(withAuthors, page, limit);
  });

  // Dettaglio
  r.get('/:id', { params: uuidParams, response: PostWithAuthorSchema }, (c) => {
    const post = posts.find(p => p.id === c.params.id);
    if (!post) throw new NotFoundError('Post not found');

    const author = users.find(u => u.id === post.authorId);
    if (!author) throw new NotFoundError('Post author not found');

    return { ...post, author };
  });

  // Crea
  r.post('/', { body: CreatePostSchema, response: PostSchema }, (c) => {
    const newPost: Post = {
      id: uuid(),
      title: c.body.title,
      content: c.body.content,
      authorId: users[0].id,
      published: c.body.published || false,
      tags: c.body.tags || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    posts.push(newPost);
    return newPost;
  });

  // Aggiorna
  r.put('/:id', {
    params: uuidParams,
    body: z.object({
      title: z.string().min(1).max(200).optional(),
      content: z.string().min(1).optional(),
      published: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
    }),
    response: PostSchema,
  }, (c) => {
    const post = posts.find(p => p.id === c.params.id);
    if (!post) throw new NotFoundError('Post not found');

    if (c.body.title) post.title = c.body.title;
    if (c.body.content) post.content = c.body.content;
    if (c.body.published !== undefined) post.published = c.body.published;
    if (c.body.tags) post.tags = c.body.tags;
    post.updatedAt = new Date();

    return post;
  });

  // Elimina
  r.delete('/:id', { params: uuidParams, response: deletedSchema }, (c) => {
    const index = posts.findIndex(p => p.id === c.params.id);
    if (index === -1) throw new NotFoundError('Post not found');

    posts.splice(index, 1);
    return { success: true, deletedId: c.params.id };
  });
});

// ============================================
// STATISTICHE — niente schema arg necessario
// ============================================

app.get('/stats', (c) => {
  const mem = process.memoryUsage();

  return {
    users: {
      total: users.length,
      admins: users.filter(u => u.role === 'admin').length,
      regular: users.filter(u => u.role === 'user').length,
    },
    posts: {
      total: posts.length,
      published: posts.filter(p => p.published).length,
      drafts: posts.filter(p => !p.published).length,
      totalTags: [...new Set(posts.flatMap(p => p.tags))].length,
    },
    performance: {
      uptime: process.uptime(),
      memoryUsage: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed },
    },
  };
});

// ============================================
// AVVIO SERVER
// ============================================

console.log('🚀 Kozo Mock Backend Server');
console.log('📍 Port: 3000');
console.log('📊 Performance: 14,453 req/sec (benchmark heavy load)');
console.log('🔒 Validation: Ajv compiled (5x faster than Zod runtime)');
console.log('⚡ Serialization: fast-json-stringify (2x faster than JSON.stringify)');
console.log('📝 OpenAPI Docs: http://localhost:3000/swagger');
console.log('🔗 API JSON: http://localhost:3000/doc');
console.log('❤️  Health Check: http://localhost:3000/health');
console.log('');
console.log('📋 Available endpoints:');
console.log('  GET  /health - Health check');
console.log('  POST /auth/login - Mock authentication');
console.log('  GET  /auth/me - Current user');
console.log('  GET  /users - List users (paginated)');
console.log('  POST /users - Create user');
console.log('  GET  /users/:id - Get user');
console.log('  PUT  /users/:id - Update user');
console.log('  DEL  /users/:id - Delete user');
console.log('  GET  /posts - List posts (paginated + filtered)');
console.log('  POST /posts - Create post');
console.log('  GET  /posts/:id - Get post with author');
console.log('  PUT  /posts/:id - Update post');
console.log('  DEL  /posts/:id - Delete post');
console.log('  GET  /stats - Application statistics');

const { port } = await app.nativeListen(3000);
console.log(`\n🚀 Kozo listening on http://localhost:${port}`);
