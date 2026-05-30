import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const { app, jobQueue } = await buildApp();

await jobQueue.process(async (job) => {
  console.log(`[worker] ${job.name}:`, job.data.message);
}, { concurrency: 2 });

console.log(`🔥 queue-redis example → http://localhost:${PORT}`);
console.log('   POST /jobs { "message": "hello" }');
console.log('   GET  /cache/:key');
await app.listen(PORT);
