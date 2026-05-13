/**
 * Isolated test database helpers for integration tests.
 *
 * Reads TEST_DATABASE_URL from the environment. If absent, integration tests
 * that call createTestDb() will throw a clear error rather than silently
 * connecting to a production database.
 *
 * @author Al Amin Ahamed
 */

import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../db/migrations/001_init.sql",
);

const TRUNCATE_ORDER = [
  "edits",
  "edit_exemplars",
  "style_preferences",
  "drafts",
  "chunks",
  "documents",
];

let _client: ReturnType<typeof postgres> | null = null;

/**
 * Creates (or returns a cached) Postgres client connected to TEST_DATABASE_URL.
 * Applies 001_init.sql on first call so the schema is always present.
 *
 * @returns postgres SQL client for test use
 * @throws {Error} When TEST_DATABASE_URL is not set or connection fails
 * @author Al Amin Ahamed
 */
export async function createTestDb(): ReturnType<typeof postgres> {
  if (_client) return _client;

  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. " +
      "Set it to a throwaway Postgres instance before running integration tests.",
    );
  }

  const sql = postgres(url, { max: 5, onnotice: () => {} });
  const migration = fs.readFileSync(MIGRATION_PATH, "utf8");
  await sql.unsafe(migration);
  _client = sql;
  return sql;
}

/**
 * Truncates all application tables in dependency order.
 * Call from beforeEach in integration tests for a clean slate.
 *
 * @throws {Error} When the DB connection has not been established first
 * @author Al Amin Ahamed
 */
export async function resetTestDb(): Promise<void> {
  const sql = await createTestDb();
  for (const table of TRUNCATE_ORDER) {
    await sql.unsafe(`TRUNCATE ${table} CASCADE`);
  }
}

/**
 * Closes the test DB connection. Call from afterAll.
 *
 * @throws {never}
 * @author Al Amin Ahamed
 */
export async function closeTestDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
  }
}
