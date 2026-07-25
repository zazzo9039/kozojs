/**
 * Example: Type-Safe Client SDK Generation
 * 
 * This example demonstrates how to generate a fully typed client SDK
 * from your Kozo API with automatic type inference from Zod schemas.
 */

import { createKozo } from '@kozojs/core';
import { z } from 'zod';
import { writeFileSync } from 'fs';

// Define Zod schemas
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2),
  createdAt: z.date(),
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
});

const UsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

// Create API
const app = createKozo();

// Define routes
app.get('/users', {
  query: UsersQuerySchema,
  response: z.array(UserSchema),
}, (c) => {
  // Your implementation
  return [];
});

app.get('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: UserSchema,
}, (c) => {
  // Your implementation
  return {} as any;
});

app.post('/users', {
  body: CreateUserSchema,
  response: UserSchema,
}, (c) => {
  // Your implementation
  return {} as any;
});

app.patch('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  body: UpdateUserSchema,
  response: UserSchema,
}, (c) => {
  // Your implementation
  return {} as any;
});

app.delete('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: z.object({ success: z.boolean() }),
}, (c) => {
  // Your implementation
  return { success: true };
});

// Generate typed client
const clientCode = app.generateClient({
  baseUrl: 'https://api.example.com',
  includeValidation: true,
  validateByDefault: false, // Opt-in validation
  defaultHeaders: {
    'Authorization': 'Bearer TOKEN_HERE'
  }
});

// Save to file
writeFileSync('./client/api.ts', clientCode);

console.log('✅ Type-safe client generated at ./client/api.ts');

/**
 * Usage Example (in your frontend):
 * 
 * ```typescript
 * import { KozoClient } from './client/api';
 * 
 * const api = new KozoClient({
 *   baseUrl: 'https://api.example.com',
 *   validateRequests: true, // Enable client-side validation
 *   defaultHeaders: {
 *     'Authorization': `Bearer ${token}`
 *   }
 * });
 * 
 * // Fully typed! IDE autocomplete + type checking
 * const users = await api.users({ page: 1, limit: 10 });
 * //    ^? User[]
 * 
 * const user = await api.usersById({ id: 'uuid-here' });
 * //    ^? User
 * 
 * const newUser = await api.postUsers({
 *   email: 'test@example.com',
 *   name: 'John Doe'
 * });
 * //    ^? User
 * 
 * // ❌ Type error: invalid email
 * await api.postUsers({
 *   email: 'not-an-email',  // Caught by TypeScript!
 *   name: 'John'
 * });
 * 
 * // ✅ Runtime validation (if enabled)
 * try {
 *   await api.postUsers({ email: 'bad', name: 'X' });
 * } catch (err) {
 *   // Zod validation error before request
 * }
 * ```
 */
