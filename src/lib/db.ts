import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

/**
 * Single shared PostgreSQL pool for the application and Better Auth.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Run a query inside a transaction with transaction-local RLS identity.
 * Sets app.current_user_id for the duration of the transaction only
 * (is_local = true) so it is safe with PgBouncer transaction mode.
 */
export async function withAuthQuery<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [
      userId,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Convenience wrapper: parameterized query under authenticated identity. */
export async function queryWithAuth<T extends QueryResultRow = QueryResultRow>(
  userId: string,
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return withAuthQuery(userId, (client) =>
    client.query<T>(text, params as never[])
  );
}
