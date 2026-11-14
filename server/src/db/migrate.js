import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function migrate({ reset = false } = {}) {
  if (reset) {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema reset.');
  }
  await pool.query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  console.log('Migration complete.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate({ reset: process.argv.includes('--reset') })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
