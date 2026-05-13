import { sql } from "../db/client.js";
import { buildSectionPrompt } from "../lib/prompts/sections/index.js";
import { SECTION_QUERIES } from "../lib/section-queries.js";
import { getLLMProvider } from "../llm/router.js";
import { logger } from "../lib/logger.js";
import { retrieveForSection } from "./retrieve.js";
import { verifyGrounding } from "./grounding-verifier.js";
import type {
  CaseSummarySection,
  DraftCitation,
  DraftResult,
  RetrievedChunk,
  SectionDraft,
} from "../types.js";

const SECTIONS: CaseSummarySection[] = [
  "parties",
  "key_dates",
  "issues",
  "procedural_history",
  "relief",
];

/** UUID v4 pattern for citation ID validation. */
const CITE_RE =
  /\[c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;

/**
 * Parses inline [c:UUID] citation markers from generated text.
 * Strips any citation ID that is not in validIds and logs the removal.
 *
 * @param text - Raw LLM output containing inline citation markers
 * @param validIds - Set of chunk IDs that were actually retrieved
 * @param chunkMap - Lookup map for chunk metadata
 * @returns Cleaned text (invalid IDs stripped) and deduplicated citation list
 * @author Al Amin Ahamed
 */
function parseCitations(
  text: string,
  validIds: Set<string>,
  chunkMap: Map<string, RetrievedChunk>,
): { cleanText: string; citations: DraftCitation[] } {
  const seen = new Set<string>();

  const cleanText = text.replace(CITE_RE, (match, id: string) => {
    if (!validIds.has(id)) {
      logger.warn({ id }, "invalid citation ID stripped from generated text");
      return "";
    }
    seen.add(id);
    return match;
  });

  const citations: DraftCitation[] = [...seen].map((id) => {
    const chunk = chunkMap.get(id);
    return {
      chunk_id: id,
      snippet: chunk?.snippet ?? "",
      score: chunk?.score ?? 0,
    };
  });

  return { cleanText, citations };
}

/**
 * Generates a five-section Case Fact Summary draft for a document.
 *
 * For each section:
 *   1. Hybrid retrieval (vector + FTS + RRF) via section-specific queries
 *   2. Prompt construction with evidence blocks
 *   3. LLM completion (via router — respects LLM_PROVIDER env)
 *   4. Citation parsing and ID validation
 *   5. Embedding-based grounding verification
 *   6. INSERT into drafts table
 *
 * @param documentId - UUID of an ingested document
 * @returns DraftResult with all five sections, citations, and grounding scores
 * @throws {Error} On DB failure or when no LLM provider is available
 * @author Al Amin Ahamed
 */
export async function generateDraft(documentId: string): Promise<DraftResult> {
  const provider = getLLMProvider();
  const temp = provider.name() === "ollama" ? 0.3 : 0.2;

  logger.info(
    { documentId, provider: provider.name() },
    "starting draft generation",
  );

  const sectionResults: Partial<Record<CaseSummarySection, SectionDraft>> = {};

  for (const section of SECTIONS) {
    const queries = SECTION_QUERIES[section];
    const chunks = await retrieveForSection(documentId, queries);
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const validIds = new Set(chunks.map((c) => c.id));

    const { system, user } = buildSectionPrompt(section, {
      chunks,
      exemplars: "",
      preferences: "",
    });

    let responseText: string;
    try {
      responseText = await provider.complete({
        system,
        messages: [{ role: "user", content: user }],
        maxTokens: 400,
        temperature: temp,
      });
    } catch (err) {
      logger.error({ err, section }, "LLM completion failed for section — using fallback");
      responseText = "Not specified in source documents.";
    }

    const { cleanText, citations } = parseCitations(responseText, validIds, chunkMap);

    const citedChunks = citations
      .map((c) => chunkMap.get(c.chunk_id))
      .filter((c): c is RetrievedChunk => c !== undefined);

    let groundingScore = 0;
    try {
      groundingScore = await verifyGrounding(cleanText, citedChunks);
    } catch (err) {
      logger.warn({ err, section }, "grounding verification failed — defaulting to 0");
    }

    const rows = await sql<Array<{ id: string }>>`
      INSERT INTO drafts
        (document_id, section, content, citations, iteration)
      VALUES (
        ${documentId},
        ${section},
        ${cleanText},
        ${JSON.stringify(citations)}::jsonb,
        1
      )
      RETURNING id
    `;

    const draftRow = rows[0];
    if (!draftRow) throw new Error(`Draft INSERT returned no row for section ${section}`);

    sectionResults[section] = {
      draftId: draftRow.id,
      content: cleanText,
      citations,
      groundingScore,
    };

    logger.info(
      { section, draftId: draftRow.id, citations: citations.length, groundingScore },
      "section draft complete",
    );
  }

  return {
    documentId,
    sections: sectionResults as Record<CaseSummarySection, SectionDraft>,
    providerUsed: provider.name(),
  };
}
