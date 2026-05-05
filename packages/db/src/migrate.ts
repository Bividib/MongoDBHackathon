import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb, createPool } from "./client.js";

const pool = createPool();
const db = createDb(pool);

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

try {
  await migrate(db, { migrationsFolder });
} finally {
  await pool.end();
}
