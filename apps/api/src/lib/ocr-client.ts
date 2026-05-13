import { z } from "zod";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";

const OCR_TIMEOUT_MS = 120_000;

const PageResultSchema = z.object({
  page_number: z.number().int().positive(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
});

const ExtractionResultSchema = z.object({
  text: z.string(),
  pages: z.array(PageResultSchema),
  overall_confidence: z.number().min(0).max(1),
  strategy_used: z.enum([
    "pdfplumber_text",
    "unstructured_hi_res",
    "tesseract_image",
  ]),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Sends a document buffer to the Python OCR sidecar and returns a validated
 * extraction result. Uses a 120-second timeout to accommodate slow scanned PDFs.
 *
 * @param buffer - Raw file bytes (PDF or image)
 * @param filename - Original filename used by the sidecar to select strategy
 * @returns Validated ExtractionResult with text, pages, confidence, and strategy
 * @throws {Error} On network failure, timeout, non-2xx response, or schema mismatch
 * @author Al Amin Ahamed
 */
export async function extractDocument(
  buffer: Buffer,
  filename: string,
): Promise<ExtractionResult> {
  const env = loadEnv();
  const url = `${env.OCR_SERVICE_URL}/ocr/extract`;

  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`OCR sidecar returned ${res.status}: ${body}`);
  }

  const raw: unknown = await res.json();
  const parsed = ExtractionResultSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "OCR response schema mismatch");
    throw new Error("OCR response did not match expected schema");
  }

  return parsed.data;
}
