import { sql } from "../db/client.js";
import { buildSectionPrompt } from "../lib/prompts/sections/index.js";
import { SECTION_QUERIES } from "../lib/section-queries.js";
import { getLLMProvider } from "../llm/router.js";
import { logger } from "../lib/logger.js";
import { embedTexts } from "./embed.js";
import { retrieveForSection } from "./retrieve.js";
import { verifyGrounding } from "./grounding-verifier.js";
import type {
  CaseSummarySection,
  DraftCitation,
  DraftResult,
  RetrievedChunk,
  SectionDraft,
  StylePreferences,
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
 * Strips any citation ID not present in validIds and logs the removal.
 *
 * @param text - Raw LLM output with inline citation markers
 * @param validIds - Set of chunk IDs actually retrieved for this section
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
    return { chunk_id: id, snippet: chunk?.snippet ?? "", score: chunk?.score ?? 0 };
  });

  return { cleanText, citations };
}

/**
 * Fetches top-K exemplars for a section, ranked by cosine similarity to
 * a query embedding (typically the section query text embedding).
 *
 * @param section - Section name
 * @param queryEmbedding - 1536-dim float array used for similarity ranking
 * @param limit - Maximum exemplars to return
 * @returns Exemplar rows or empty array when none exist
 * @author Al Amin Ahamed
 */
async function fetchExemplars(
  section: string,
  queryEmbedding: number[],
  limit = 3,
): Promise<Array<{ before_text: string; after_text: string; edit_class: string }>> {
  const embStr = `[${queryEmbedding.join(",")}]`;
  return sql<Array<{ before_text: string; after_text: string; edit_class: string }>>`
    SELECT before_text, after_text, edit_class
    FROM edit_exemplars
    WHERE section = ${section}
    ORDER BY embedding <=> ${embStr}::vector
    LIMIT ${limit}
  `;
}

/**
 * Fetches the style preferences for a section and formats them as a
 * human-readable HOUSE STYLE block for injection into prompts.
 *
 * @param section - Section name
 * @returns Formatted preferences string or empty string when none stored
 * @author Al Amin Ahamed
 */
async function buildPreferencesBlock(section: string): Promise<string> {
  const rows = await sql<Array<{ preferences: StylePreferences }>>`
    SELECT preferences FROM style_preferences WHERE section = ${section}
  `;
  const prefs = rows[0]?.preferences;
  if (!prefs) return "";

  // Use ?? [] guards: LLM may omit array fields; Zod defaults only apply at
  // parse time, not when reading raw JSONB back from the DB via porsager.
  const avoid = prefs.avoid_phrases ?? [];
  const prefer = prefs.prefer_phrases ?? [];
  const rules = prefs.formatting_rules ?? [];

  const lines: string[] = ["HOUSE STYLE (follow these preferences):"];
  if (prefs.tone) lines.push(`  Tone: ${prefs.tone}`);
  if (avoid.length > 0) lines.push(`  Avoid: ${avoid.join("; ")}`);
  if (prefer.length > 0) lines.push(`  Prefer: ${prefer.join("; ")}`);
  for (const rule of rules) lines.push(`  Rule: ${rule}`);

  return lines.join("\n");
}

/**
 * Formats retrieved exemplars as a PRIOR REVISIONS block showing
 * Before/After pairs for few-shot steering of the LLM.
 *
 * @param exemplars - Exemplar rows from edit_exemplars
 * @returns Formatted PRIOR REVISIONS string or empty string when none
 * @author Al Amin Ahamed
 */
function buildExemplarsBlock(
  exemplars: Array<{ before_text: string; after_text: string; edit_class: string }>,
): string {
  if (exemplars.length === 0) return "";
  const pairs = exemplars
    .map((e) => `Before: ${e.before_text.slice(0, 200)}\nAfter:  ${e.after_text.slice(0, 200)}`)
    .join("\n\n");
  return `PRIOR REVISIONS (bias your output toward the After patterns):\n\n${pairs}`;
}

/**
 * Generates a five-section Case Fact Summary draft for a document.
 *
 * For each section:
 *   1. Hybrid retrieval (vector + FTS + RRF) via section-specific queries
 *   2. Exemplar and preference injection (edit-loop signals)
 *   3. Prompt construction with evidence, prior revisions, and house style
 *   4. LLM completion via router (respects LLM_PROVIDER env)
 *   5. Citation parsing and ID validation
 *   6. Embedding-based grounding verification
 *   7. INSERT into drafts table
 *
 * @param documentId - UUID of an ingested document
 * @returns DraftResult with all five sections, citations, and grounding scores
 * @throws {Error} On DB failure or when no LLM provider is available
 * @author Al Amin Ahamed
 */
export async function generateDraft(documentId: string): Promise<DraftResult> {
  const provider = getLLMProvider();
  const temp = provider.name() === "ollama" ? 0.3 : 0.2;

  logger.info({ documentId, provider: provider.name() }, "starting draft generation");

  // Pre-embed all section query texts in one batch for exemplar lookup
  const sectionQueryTexts = SECTIONS.map(
    (s) => (SECTION_QUERIES[s] ?? [""])[0] ?? "",
  );
  let queryEmbeddings: number[][] = [];
  try {
    queryEmbeddings = await embedTexts(sectionQueryTexts);
  } catch (err) {
    logger.warn({ err }, "section query embedding failed — exemplar lookup disabled");
    queryEmbeddings = SECTIONS.map(() => []);
  }

  const sectionResults: Partial<Record<CaseSummarySection, SectionDraft>> = {};

  for (const [sectionIdx, section] of SECTIONS.entries()) {
    const queries = SECTION_QUERIES[section];
    const chunks = await retrieveForSection(documentId, queries);
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const validIds = new Set(chunks.map((c) => c.id));

    // Fetch exemplars and preferences (Phase 4 signals; empty on first run)
    const queryEmb = queryEmbeddings[sectionIdx] ?? [];
    const [rawExemplars, preferencesBlock] = await Promise.all([
      queryEmb.length > 0
        ? fetchExemplars(section, queryEmb)
        : Promise.resolve([] as Array<{ before_text: string; after_text: string; edit_class: string }>),
      buildPreferencesBlock(section),
    ]);
    const exemplarsBlock = buildExemplarsBlock(rawExemplars);

    const { system, user } = buildSectionPrompt(section, {
      chunks,
      exemplars: exemplarsBlock,
      preferences: preferencesBlock,
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
      logger.error({ err, section }, "LLM completion failed — using fallback");
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
      {
        section,
        draftId: draftRow.id,
        citations: citations.length,
        groundingScore,
        exemplars: rawExemplars.length,
        hasPreferences: preferencesBlock.length > 0,
      },
      "section draft complete",
    );
  }

  return {
    documentId,
    sections: sectionResults as Record<CaseSummarySection, SectionDraft>,
    providerUsed: provider.name(),
  };
}
