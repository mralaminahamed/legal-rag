import { z } from "zod";
import {
  CitationsResponseSchema,
  DocumentDetailSchema,
  DocumentListItemSchema,
  DraftResponseSchema,
  EditResponseSchema,
  IngestResponseSchema,
  type CitationsResponse,
  type DocumentDetail,
  type DocumentListItem,
  type DraftResponse,
  type EditResponse,
  type IngestResponse,
} from "./types";

const BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:3000";

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  const json: unknown = await res.json();
  return schema.parse(json);
}

export const api = {
  listDocuments(): Promise<DocumentListItem[]> {
    return request("/documents", z.array(DocumentListItemSchema));
  },

  getDocument(id: string): Promise<DocumentDetail> {
    return request(`/documents/${id}`, DocumentDetailSchema);
  },

  generateDraft(documentId: string): Promise<DraftResponse> {
    return request("/draft", DraftResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId }),
    });
  },

  getDraftCitations(draftId: string): Promise<CitationsResponse> {
    return request(`/draft/${draftId}/citations`, CitationsResponseSchema);
  },

  ingestDocument(file: File): Promise<IngestResponse> {
    const form = new FormData();
    form.append("file", file);
    return request("/ingest", IngestResponseSchema, { method: "POST", body: form });
  },

  submitEdit(draftId: string, section: string, editedText: string): Promise<EditResponse> {
    return request("/edit", EditResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: draftId, section, edited_text: editedText }),
    });
  },
};
