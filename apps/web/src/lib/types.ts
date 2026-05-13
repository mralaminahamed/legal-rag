import { z } from "zod";

export const DocumentListItemSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  document_type: z.string().nullable(),
  created_at: z.string(),
});
export type DocumentListItem = z.infer<typeof DocumentListItemSchema>;

export const PartiesSchema = z.object({
  plaintiffs: z.array(z.string()).default([]),
  defendants: z.array(z.string()).default([]),
  counsel: z.array(z.string()).default([]),
});

export const KeyDateSchema = z.object({
  label: z.string(),
  iso_date: z.string(),
});

export const DocumentDetailSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  document_type: z.string().nullable(),
  parties: PartiesSchema.nullable(),
  key_dates: z.array(KeyDateSchema).nullable(),
  ocr_confidence: z.number(),
  created_at: z.string(),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

export const CitationSchema = z.object({
  chunk_id: z.string(),
  snippet: z.string(),
  score: z.number(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SectionDraftSchema = z.object({
  draftId: z.string(),
  content: z.string(),
  citations: z.array(CitationSchema),
  groundingScore: z.number(),
});
export type SectionDraft = z.infer<typeof SectionDraftSchema>;

export const SECTIONS = ["parties", "key_dates", "issues", "procedural_history", "relief"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  parties: "Parties",
  key_dates: "Key Dates",
  issues: "Issues / Allegations",
  procedural_history: "Procedural History",
  relief: "Relief Sought",
};

export const DraftResponseSchema = z.object({
  documentId: z.string(),
  sections: z.record(z.string(), SectionDraftSchema),
  providerUsed: z.string(),
});
export type DraftResponse = z.infer<typeof DraftResponseSchema>;

export const IngestResponseSchema = z.object({
  documentId: z.string(),
  chunkCount: z.number(),
  ocrConfidence: z.number(),
  ocrStrategy: z.string(),
  fields: z.object({
    document_type: z.string().nullable(),
    parties: PartiesSchema,
    key_dates: z.array(KeyDateSchema),
  }),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

export const EditResponseSchema = z.object({
  editId: z.string(),
  classification: z.object({
    class: z.enum(["rephrase", "factual_correction", "formatting", "omission", "addition"]),
    confidence: z.number(),
    reasoning: z.string(),
  }),
  signalScore: z.number(),
  promotedToExemplar: z.boolean(),
});
export type EditResponse = z.infer<typeof EditResponseSchema>;

export const CitationsResponseSchema = z.object({
  draft_id: z.string(),
  document_id: z.string(),
  section: z.string(),
  iteration: z.number(),
  citations: z.array(CitationSchema),
});
export type CitationsResponse = z.infer<typeof CitationsResponseSchema>;
