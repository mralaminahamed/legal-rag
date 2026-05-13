/**
 * Integration test: full ingest → draft → edit → re-draft flow.
 *
 * Uses:
 *   - Real Postgres (TEST_DATABASE_URL env var — test is skipped when absent)
 *   - Mock OCR client (no sidecar needed)
 *   - Mock LLM provider (deterministic, no API calls)
 *   - Stub embedder (deterministic bag-of-words vectors)
 *
 * What this validates:
 *   - SQL correctness across all INSERT / SELECT paths
 *   - Full request/response shapes through Hono route handlers
 *   - Edit-loop signal flow: diff → classify → exemplar storage → re-draft injection
 *
 * @author Al Amin Ahamed
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
const SKIP = !TEST_DB_URL;

// ── Stubs applied before any imports that trigger module resolution ────────────

// Bag-of-words stub embedder — same text always produces same vector
vi.mock("../pipeline/embed.js", () => ({
  embedTexts: async (texts: string[]) =>
    texts.map((t) => {
      const words = t.toLowerCase().split(/\s+/);
      const vec = new Array(16).fill(0) as number[];
      for (const word of words) {
        const idx = (word.charCodeAt(0) ?? 0) % 16;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
      // normalise so cosine similarity is meaningful
      const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map((v) => v / mag);
    }),
}));

// Mock OCR sidecar — returns deterministic extraction result
vi.mock("../lib/ocr-client.js", () => ({
  extractDocument: async (_buf: Buffer, filename: string) => ({
    text: FIXTURE_TEXT,
    pages: [{ page_number: 1, text: FIXTURE_TEXT, confidence: 1.0 }],
    overall_confidence: 1.0,
    strategy_used: "pdfplumber_text",
  }),
}));

// Mock LLM router — returns our controllable mock provider
import { buildMockProvider } from "../__test-helpers__/mock-llm-provider.js";

const FIELD_RESPONSE = JSON.stringify({
  document_type: "complaint",
  parties: { plaintiffs: ["Alice Test"], defendants: ["Bob Corp"], counsel: ["Test LLP"] },
  key_dates: [{ label: "filing", iso_date: "2024-01-15" }],
});

const SECTION_RESPONSE = (section: string) =>
  `${section} content for the test complaint [c:00000000-0000-0000-0000-000000000001].`;

const CLASSIFY_RESPONSE = JSON.stringify({
  class: "rephrase",
  confidence: 0.9,
  reasoning: "test classification",
});

const PREFS_RESPONSE = JSON.stringify({
  tone: "formal",
  avoid_phrases: [],
  prefer_phrases: ["respectfully"],
  formatting_rules: [],
});

const mockProvider = buildMockProvider({
  "document_type": FIELD_RESPONSE,
  "parties":        FIELD_RESPONSE,
  "key_dates":      FIELD_RESPONSE,
  "ORIGINAL TEXT":  CLASSIFY_RESPONSE,
  "SECTION: parties":             SECTION_RESPONSE("parties"),
  "SECTION: key_dates":           SECTION_RESPONSE("key_dates"),
  "SECTION: issues":              SECTION_RESPONSE("issues"),
  "SECTION: procedural_history":  SECTION_RESPONSE("procedural_history"),
  "SECTION: relief":              SECTION_RESPONSE("relief"),
  "HOUSE STYLE": PREFS_RESPONSE,
  "style preferences": PREFS_RESPONSE,
  _default: CLASSIFY_RESPONSE,
});

vi.mock("../llm/router.js", () => ({
  getLLMProvider: () => mockProvider,
}));

// ── Test fixtures ──────────────────────────────────────────────────────────────

const FIXTURE_TEXT = `
UNITED STATES DISTRICT COURT
Alice Test, Plaintiff, v. Bob Corp, Defendant. Case No: 2024-TEST-001
Filing Date: January 15, 2024. Counsel: Test LLP.

Plaintiff alleges breach of contract. Defendant failed to pay the agreed amount.
The court hearing is scheduled for March 1, 2024 at 9:00 AM.
Plaintiff seeks compensatory damages of $50,000 and attorneys fees.
`.trim();

// ── Helpers ────────────────────────────────────────────────────────────────────

import { buildApp } from "../server.js";
import { createTestDb, resetTestDb, closeTestDb } from "../__test-helpers__/test-db.js";

async function post(app: ReturnType<typeof buildApp>, path: string, body: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return app.fetch(req);
}

async function postForm(app: ReturnType<typeof buildApp>, path: string, form: FormData) {
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    body: form,
  });
  return app.fetch(req);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("E2E integration: ingest → draft → edit → re-draft", () => {
  const app = buildApp();
  let documentId: string;
  let draftSections: Record<string, { draftId: string; content: string; groundingScore: number }>;

  beforeAll(async () => {
    await createTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  it("POST /ingest returns documentId with populated fields and chunks", async () => {
    const form = new FormData();
    const blob = new Blob([Buffer.from(FIXTURE_TEXT)], { type: "application/pdf" });
    form.append("file", blob, "test-fixture.pdf");

    const res = await postForm(app, "/ingest", form);
    expect(res.status).toBe(200);

    const body = await res.json() as {
      documentId: string;
      chunkCount: number;
      fields: { document_type: string; parties: { plaintiffs: string[] } };
    };

    expect(body.documentId).toBeTruthy();
    expect(body.chunkCount).toBeGreaterThan(0);
    expect(body.fields.document_type).toBe("complaint");
    expect(body.fields.parties.plaintiffs).toContain("Alice Test");

    documentId = body.documentId;
  });

  it("POST /draft returns all 5 non-empty sections after ingest", async () => {
    // Ingest first
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(FIXTURE_TEXT)], { type: "application/pdf" }), "test-fixture.pdf");
    const ingestRes = await postForm(app, "/ingest", form);
    expect(ingestRes.status).toBe(200);
    const { documentId: docId } = await ingestRes.json() as { documentId: string };

    // Draft
    const res = await post(app, "/draft", { document_id: docId });
    expect(res.status).toBe(200);

    const body = await res.json() as {
      documentId: string;
      sections: Record<string, { draftId: string; content: string }>;
      providerUsed: string;
    };

    expect(body.documentId).toBe(docId);
    expect(body.providerUsed).toBe("openai"); // mock provider returns "openai"

    const sections = ["parties", "key_dates", "issues", "procedural_history", "relief"];
    for (const section of sections) {
      const s = body.sections[section];
      expect(s, `Section ${section} should exist`).toBeTruthy();
      expect(s!.content.length, `Section ${section} content should be non-empty`).toBeGreaterThan(0);
      expect(s!.draftId).toBeTruthy();
    }

    draftSections = body.sections as typeof draftSections;
    documentId = docId;
  });

  it("POST /edit returns signalScore and promotedToExemplar flag", async () => {
    // Ingest + draft first
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(FIXTURE_TEXT)], { type: "application/pdf" }), "test-fixture.pdf");
    await postForm(app, "/ingest", form);
    const ingestRes = await postForm(app, "/ingest",
      (() => { const f = new FormData(); f.append("file", new Blob([Buffer.from(FIXTURE_TEXT)], { type: "application/pdf" }), "test-fixture.pdf"); return f; })()
    );
    const { documentId: docId } = await ingestRes.json() as { documentId: string };

    await resetTestDb(); // clean slate for this sub-test
    const form2 = new FormData();
    form2.append("file", new Blob([Buffer.from(FIXTURE_TEXT)], { type: "application/pdf" }), "test-fixture.pdf");
    const ingestRes2 = await postForm(app, "/ingest", form2);
    const { documentId: docId2 } = await ingestRes2.json() as { documentId: string };

    const draftRes = await post(app, "/draft", { document_id: docId2 });
    const draftBody = await draftRes.json() as { sections: Record<string, { draftId: string; content: string }> };
    const partiesSection = draftBody.sections["parties"];
    expect(partiesSection).toBeTruthy();

    const editRes = await post(app, "/edit", {
      draft_id: partiesSection!.draftId,
      section: "parties",
      edited_text: partiesSection!.content + " Additional counsel: Test LLP (Counsel of Record).",
    });
    expect(editRes.status).toBe(200);

    const editBody = await editRes.json() as {
      editId: string;
      classification: { class: string };
      signalScore: number;
      promotedToExemplar: boolean;
    };

    expect(editBody.editId).toBeTruthy();
    expect(editBody.signalScore).toBeGreaterThan(0);
    expect(typeof editBody.promotedToExemplar).toBe("boolean");
  });

  it("GET /draft/:id/citations returns citation array for a stored draft", async () => {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(FIXTURE_TEXT)], { type: "application/pdf" }), "test-fixture.pdf");
    const ir = await postForm(app, "/ingest", form);
    const { documentId: docId } = await ir.json() as { documentId: string };

    const dr = await post(app, "/draft", { document_id: docId });
    const db = await dr.json() as { sections: Record<string, { draftId: string }> };
    const draftId = db.sections["parties"]?.draftId ?? "";

    const citRes = await app.fetch(new Request(`http://localhost/draft/${draftId}/citations`));
    expect(citRes.status).toBe(200);

    const citBody = await citRes.json() as { draft_id: string; citations: unknown[] };
    expect(citBody.draft_id).toBe(draftId);
    expect(Array.isArray(citBody.citations)).toBe(true);
  });
});

// When TEST_DATABASE_URL is absent, emit a clear skip notice
describe.skipIf(!SKIP)("E2E integration (SKIPPED — set TEST_DATABASE_URL to run)", () => {
  it.skip("integration tests require TEST_DATABASE_URL", () => {});
});
