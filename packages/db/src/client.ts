import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.js";

const { Pool } = pg;

export type RunwayDb = ReturnType<typeof createDb>;

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a RunwayOps database pool.");
  }

  return new Pool({ connectionString });
}

export function createDb(pool = createPool()) {
  return drizzle(pool, { schema });
}
