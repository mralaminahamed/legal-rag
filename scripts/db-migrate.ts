/**
 * Applies all SQL migration files in db/migrations/ in lexicographic order.
 * Idempotent — uses IF NOT EXISTS throughout the schema.
 *
 * Usage: npm run db:migrate
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
const MIGRATIONS_DIR = path.join(__dirname, "../db/migrations");

const sql = postgres(DATABASE_URL, { max: 1 });

async function main(): Promise<void> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  process.stdout.write(`Applying ${files.length} migration(s) from ${MIGRATIONS_DIR}\n`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`  → ${file} ... `);
    await sql.unsafe(content);
    process.stdout.write("done\n");
  }

  await sql.end();
  process.stdout.write("Migrations complete.\n");
}

main().catch(err => { process.stderr.write(String(err) + "\n"); process.exit(1); });
