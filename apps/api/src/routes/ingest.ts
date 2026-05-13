import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import { ingestDocument } from "../pipeline/ingest.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".tiff"]);

export const ingestRouter = new Hono();

/**
 * POST /ingest
 * Accepts a multipart/form-data upload with a single `file` field.
 * Runs the full ingestion pipeline: OCR → field extraction → chunking → embedding.
 *
 * @returns 200 IngestResult JSON on success
 * @returns 400 for missing file, bad extension, or empty body
 * @returns 413 for files exceeding 50 MB
 * @returns 500 for pipeline errors
 * @author Al Amin Ahamed
 */
ingestRouter.post("/", async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid multipart body" }, 400);
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return c.json({ error: "Missing `file` field in multipart form" }, 400);
  }

  const file = fileEntry as File;
  const filename = file.name || "upload.bin";
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return c.json(
      { error: `Extension '${ext}' not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}` },
      400,
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    return c.json(
      { error: `File size ${arrayBuffer.byteLength} bytes exceeds 50 MB limit` },
      413,
    );
  }

  const buffer = Buffer.from(arrayBuffer);

  try {
    const result = await ingestDocument(buffer, filename);
    return c.json(result, 200);
  } catch (err) {
    logger.error({ err, filename }, "ingestion pipeline failed");
    const message = err instanceof Error ? err.message : "Internal error";
    return c.json({ error: message }, 500);
  }
});
