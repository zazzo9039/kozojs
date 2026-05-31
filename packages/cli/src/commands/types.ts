import pc from 'picocolors';
import path from 'node:path';
import { generateKozoTypes } from '../kozo/types.js';

export async function typesCommand(): Promise<void> {
  const out = await generateKozoTypes();
  if (!out) {
    console.error(pc.red('No kozo.config.ts found (export default defineKozoApp({ types: ... }))'));
    process.exit(1);
  }
  console.log(pc.green('✓ Generated'), path.relative(process.cwd(), out));
}
