import { Pool, type QueryResultRow } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params)
  return result.rows
}

export async function execute(text: string, params?: unknown[]) {
  const result = await pool.query(text, params)
  return result
}

/** Run queries within a tenant-isolated transaction */
export async function withTenant<T>(
  agencyId: string,
  fn: () => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `SELECT set_config('app.current_agency_id', $1, true)`,
      [agencyId]
    )
    const result = await fn()
    await client.query("COMMIT")
    return result
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}
