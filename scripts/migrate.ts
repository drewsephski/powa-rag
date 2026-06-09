/**
 * Database migration runner.
 * Usage: bun run scripts/migrate.ts
 *
 * Reads SQL files from db/migrations/ and executes them in order.
 */

import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { Pool } from "pg"

const __dirname = dirname(fileURLToPath(import.meta.url))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function migrate() {
  const migrationFile = join(__dirname, "..", "db", "migrations", "001_initial.sql")
  const sql = readFileSync(migrationFile, "utf-8")

  console.log(`Running migration: 001_initial.sql`)

  try {
    await pool.query(sql)
    console.log("Migration complete.")
  } catch (err) {
    console.error("Migration failed:", err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
