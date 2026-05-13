/**
 * Drops the entire public schema and re-applies all migrations.
 * Requires CONFIRM_RESET=1 to prevent accidental data loss.
 *
 * Usage: CONFIRM_RESET=1 npm run db:reset
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://legal:secret@localhost:5432/legalrag";
const CONFIRM_RESET = process.env["CONFIRM_RESET"] === "1";
const MIGRATIONS_DIR = path.join(__dirname, "../db/migrations");

if (!CONFIRM_RESET) {
  process.stderr.write("Set CONFIRM_RESET=1 to confirm database reset. All data will be lost.\n");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function main(): Promise<void> {
  process.stdout.write("Dropping all tables...\n");
  await sql.unsafe(`
    DROP TABLE IF EXISTS style_preferences CASCADE;
    DROP TABLE IF EXISTS edit_exemplars CASCADE;
    DROP TABLE IF EXISTS edits CASCADE;
    DROP TABLE IF EXISTS drafts CASCADE;
    DROP TABLE IF EXISTS chunks CASCADE;
    DROP TABLE IF EXISTS documents CASCADE;
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`  → ${file} ... `);
    await sql.unsafe(content);
    process.stdout.write("done\n");
  }

  await sql.end();
  process.stdout.write("Database reset complete.\n");
}

main().catch(err => { process.stderr.write(String(err) + "\n"); process.exit(1); });
