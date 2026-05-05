import pg from "pg";

const { Pool } = pg;

/**
 * Idempotency-key TTL cleanup activity.
 *
 * Deletes expired idempotency keys: `WHERE expires_at < now()`.
 * Runs hourly via a Temporal scheduled workflow (or cron schedule).
 *
 * This runs as a superuser/admin role because it operates across tenants.
 * The cleanup is safe because expired keys have already served their
 * deduplication purpose.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<{ deletedCount: number }> {
  const connectionString = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    return { deletedCount: 0 };
  }

  const pool = new Pool({ connectionString });

  try {
    const result = await pool.query(`
      DELETE FROM idempotency_keys
      WHERE expires_at < now()
    `);

    return { deletedCount: result.rowCount ?? 0 };
  } finally {
    await pool.end();
  }
}
