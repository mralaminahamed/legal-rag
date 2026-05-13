import { z } from "zod";
import { sql } from "../db/client.js";
import { getLLMProvider } from "../llm/router.js";
import { logger } from "../lib/logger.js";

/** Minimum new edits since last update before running another summarisation. */
const DEBOUNCE_COUNT = 3;

const PreferencesSchema = z.object({
  tone: z.enum(["formal", "neutral", "informal"]).optional(),
  avoid_phrases: z.array(z.string()).default([]),
  prefer_phrases: z.array(z.string()).default([]),
  formatting_rules: z.array(z.string()).default([]),
});

type Preferences = z.infer<typeof PreferencesSchema>;

const SYSTEM = `You are analyzing operator edits to a legal document section to extract recurring style patterns.

Identify consistent preferences across the edits and return a JSON object:
{
  "tone": "formal" | "neutral" | "informal",
  "avoid_phrases": ["exact phrase or pattern to avoid"],
  "prefer_phrases": ["exact phrase or pattern to prefer"],
  "formatting_rules": ["concise rule, e.g. Use past tense for procedural events"]
}

Rules:
- Only include patterns that appear in at least 2 edits.
- avoid_phrases and prefer_phrases should be short, literal phrases or close variants.
- formatting_rules should be actionable instructions.
- If no clear pattern exists for a field, use an empty array.`;

/**
 * Reads the last 10 edits for a section, asks the LLM to summarise recurring
 * style patterns, and UPSERTs the result into style_preferences.
 *
 * Debounced: skips the update if fewer than DEBOUNCE_COUNT new edits have
 * accumulated since the last update (tracked via style_preferences.edit_count).
 *
 * @param section - Case summary section name
 * @author Al Amin Ahamed
 */
export async function updateStylePreferences(section: string): Promise<void> {
  // Check debounce
  const totalRows = await sql<Array<{ count: string }>>`
    SELECT COUNT(*)::text AS count FROM edits WHERE section = ${section}
  `;
  const totalEdits = parseInt(totalRows[0]?.count ?? "0", 10);

  const prefRows = await sql<Array<{ edit_count: number }>>`
    SELECT edit_count FROM style_preferences WHERE section = ${section}
  `;
  const lastCount = prefRows[0]?.edit_count ?? 0;

  if (totalEdits - lastCount < DEBOUNCE_COUNT) {
    logger.debug(
      { section, totalEdits, lastCount },
      "preferences debounce — not enough new edits",
    );
    return;
  }

  // Fetch last 10 edits for this section
  const edits = await sql<Array<{ original_text: string; edited_text: string; edit_class: string }>>`
    SELECT original_text, edited_text, edit_class
    FROM edits
    WHERE section = ${section}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  if (edits.length === 0) return;

  const editSummary = edits
    .map(
      (e, i) =>
        `Edit ${i + 1} [${e.edit_class}]:\nBefore: ${e.original_text.slice(0, 200)}\nAfter: ${e.edited_text.slice(0, 200)}`,
    )
    .join("\n\n---\n\n");

  const user = `SECTION: ${section}\n\nRECENT EDITS:\n\n${editSummary}\n\nSummarise the style preferences.`;

  const provider = getLLMProvider();
  let preferences: Preferences;

  try {
    preferences = await provider.completeJSON(
      { system: SYSTEM, messages: [{ role: "user", content: user }], maxTokens: 300, temperature: 0.1 },
      PreferencesSchema,
    );
  } catch (err) {
    logger.error({ err, section }, "style preference summarisation failed");
    return;
  }

  await sql`
    INSERT INTO style_preferences (section, preferences, edit_count, updated_at)
    VALUES (${section}, ${sql.json(preferences)}, ${totalEdits}, NOW())
    ON CONFLICT (section) DO UPDATE
      SET preferences = EXCLUDED.preferences,
          edit_count  = EXCLUDED.edit_count,
          updated_at  = NOW()
  `;

  logger.info({ section, totalEdits }, "style preferences updated");
}
