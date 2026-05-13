/**
 * Smoke-test script for the ingestion pipeline.
 * Run: tsx scripts/test-ingest.ts [pdf-path]
 *
 * Defaults to samples/inputs/01-clean-complaint.pdf.
 * Requires the API service to be running at PORT_API (default 3000).
 *
 * @author Al Amin Ahamed
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";
const PDF_PATH =
  process.argv[2] ??
  path.join(__dirname, "../samples/inputs/01-clean-complaint.pdf");

async function main(): Promise<void> {
  if (!fs.existsSync(PDF_PATH)) {
    process.stderr.write(`File not found: ${PDF_PATH}\n`);
    process.exit(1);
  }

  const fileBytes = fs.readFileSync(PDF_PATH);
  const filename = path.basename(PDF_PATH);

  process.stdout.write(`Ingesting: ${filename} (${fileBytes.length} bytes)\n`);
  process.stdout.write(`API:       ${API_URL}/ingest\n\n`);

  const form = new FormData();
  form.append("file", new Blob([fileBytes], { type: "application/pdf" }), filename);

  const t0 = Date.now();
  const res = await fetch(`${API_URL}/ingest`, { method: "POST", body: form });
  const elapsed = Date.now() - t0;

  const body: unknown = await res.json();

  if (!res.ok) {
    process.stderr.write(`HTTP ${res.status} after ${elapsed}ms\n`);
    process.stderr.write(JSON.stringify(body, null, 2) + "\n");
    process.exit(1);
  }

  process.stdout.write(`HTTP ${res.status} — completed in ${elapsed}ms\n\n`);
  process.stdout.write(JSON.stringify(body, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${String(err)}\n`);
  process.exit(1);
});
