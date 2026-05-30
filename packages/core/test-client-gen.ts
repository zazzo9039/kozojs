/**
 * Test script for Client SDK Generation
 * 
 * Run: tsx test-client-gen.ts
 */

import { createKozo } from './src/index.js';
import { z } from 'zod';
import { writeFileSync } from 'fs';
import { mkdirSync } from 'fs';

console.log('🧪 Testing Client SDK Generation\n');

// Create a sample API
const app = createKozo({ port: 3000 });

// Define schemas
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['user', 'admin']),
  createdAt: z.date(),
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['user', 'admin']).optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

const UsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  role: z.enum(['user', 'admin']).optional(),
});

// Define routes
app.get('/users', {
  query: UsersQuerySchema,
  response: z.array(UserSchema),
}, (c) => []);

app.get('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: UserSchema,
}, (c) => ({} as any));

app.post('/users', {
  body: CreateUserSchema,
  response: UserSchema,
}, (c) => ({} as any));

app.patch('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  body: UpdateUserSchema,
  response: UserSchema,
}, (c) => ({} as any));

app.delete('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: z.object({ success: z.boolean() }),
}, (c) => ({ success: true }));

// Test 1: Generate client without validation
console.log('📝 Test 1: Generate client (no validation)');
const client1 = app.generateClient('https://api.example.com');
console.log(`   ✅ Generated ${client1.length} characters`);
console.log(`   ✅ Contains class definition: ${client1.includes('class KozoClient')}`);
console.log(`   ✅ Contains methods: ${client1.includes('async users(')}`);

// Test 2: Generate client with validation
console.log('\n📝 Test 2: Generate client (with validation)');
const client2 = app.generateClient({
  baseUrl: 'https://api.example.com',
  includeValidation: true,
  validateByDefault: false,
  defaultHeaders: {
    'Authorization': 'Bearer TOKEN'
  }
});
console.log(`   ✅ Generated ${client2.length} characters`);
console.log(`   ✅ Contains Zod import: ${client2.includes("import { z } from 'zod'")}`);
console.log(`   ✅ Contains validation: ${client2.includes('validateRequests')}`);

// Test 3: Save to file
console.log('\n📝 Test 3: Save generated client to file');
try {
  mkdirSync('./generated', { recursive: true });
  writeFileSync('./generated/api-client.ts', client2);
  console.log('   ✅ Client saved to ./generated/api-client.ts');
} catch (err) {
  console.error('   ❌ Failed to save client:', err);
}

// Test 4: Verify client structure
console.log('\n📝 Test 4: Verify client structure');
const expectedMethods = [
  'users(',
  'usersById(',
  'postUsers(',
  'patchUsersById(',
  'deleteUsersById('
];

let allMethodsPresent = true;
for (const method of expectedMethods) {
  const present = client2.includes(method);
  console.log(`   ${present ? '✅' : '❌'} Method ${method}: ${present ? 'found' : 'missing'}`);
  if (!present) allMethodsPresent = false;
}

// Final result
console.log('\n' + '='.repeat(60));
if (allMethodsPresent) {
  console.log('✅ ALL TESTS PASSED');
  console.log('\n🎉 Client SDK Generation is working perfectly!');
  console.log('\nNext steps:');
  console.log('  1. Check ./generated/api-client.ts');
  console.log('  2. Try using it in a frontend project');
  console.log('  3. npm publish @kozojs/core@0.2.0');
} else {
  console.log('❌ SOME TESTS FAILED');
  console.log('\nPlease review the generated client code.');
}
console.log('='.repeat(60));
