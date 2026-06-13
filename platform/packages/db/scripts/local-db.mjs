/**
 * Cafe OS — local Postgres (no Docker, no system install).
 *
 * Runs a REAL Postgres server from an embedded binary, persisting data to
 * packages/db/.localdb. The app/Prisma connect to it exactly like a cloud
 * Postgres — so the schema is identical and "push to cloud" = swap DATABASE_URL.
 *
 * Usage (leave running in its own terminal):
 *   npm run db:local          # from platform/  (alias) — or:
 *   node scripts/local-db.mjs
 *
 * Then in another terminal:  npm run db:push && npm run db:seed && npm run dev
 *
 * Connection string (already the default in .env.example):
 *   postgresql://cafeos:cafeos@localhost:5433/cafeos
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '.localdb');
const PORT = 5433;
const USER = 'cafeos';
const PASSWORD = 'cafeos';
const DBNAME = 'cafeos';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Force UTF8 + C locale so the local cluster matches cloud Postgres exactly.
  // Without this, Windows initdb picks WIN1252 and can't store ₹ / Hindi / emoji.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

async function main() {
  const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));
  if (firstRun) {
    console.log('⬇️  First run — downloading Postgres binary & initialising cluster…');
    await pg.initialise();
  }

  await pg.start();
  console.log(`🐘  Postgres running on localhost:${PORT}`);

  // ensure the database exists (idempotent)
  try {
    await pg.createDatabase(DBNAME);
    console.log(`✅  Created database "${DBNAME}"`);
  } catch {
    console.log(`✅  Database "${DBNAME}" already present`);
  }

  console.log('');
  console.log('   DATABASE_URL = ' + `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DBNAME}`);
  console.log('   Next:  npm run db:push  &&  npm run db:seed  &&  npm run dev');
  console.log('   (leave this terminal open — Ctrl+C to stop the database)');
}

async function shutdown() {
  console.log('\n⏹️  Stopping Postgres…');
  try { await pg.stop(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((e) => {
  console.error('Failed to start local Postgres:', e);
  process.exit(1);
});
