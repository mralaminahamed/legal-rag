import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UploadView } from "@/views/UploadView";
import { DraftView } from "@/views/DraftView";
import { ComparisonView } from "@/views/ComparisonView";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DocumentListItem, IngestResponse, DraftResponse } from "@/lib/types";
import { toast } from "sonner";

type View = "upload" | "draft" | "comparison";

export default function App() {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [view, setView] = useState<View>("upload");
  const [draft1, setDraft1] = useState<DraftResponse | null>(null);
  const [draft2, setDraft2] = useState<DraftResponse | null>(null);
  const qc = useQueryClient();

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.listDocuments(),
    refetchInterval: view === "upload" ? 5000 : false,
  });

  const { data: document } = useQuery({
    queryKey: ["document", selectedDocId],
    queryFn: () => api.getDocument(selectedDocId!),
    enabled: !!selectedDocId,
  });

  const { mutate: generateDraft, isPending: isGenerating } = useMutation({
    mutationFn: (docId: string) => api.generateDraft(docId),
    onSuccess: (result) => {
      setDraft1(result);
      setDraft2(null);
      setView("draft");
    },
    onError: (err: Error) => toast.error(`Draft generation failed: ${err.message}`),
  });

  const selectDocument = (doc: DocumentListItem) => {
    setSelectedDocId(doc.id);
    qc.invalidateQueries({ queryKey: ["document", doc.id] });
    generateDraft(doc.id);
  };

  const handleIngested = (result: IngestResponse) => {
    qc.invalidateQueries({ queryKey: ["documents"] });
    setSelectedDocId(result.documentId);
    generateDraft(result.documentId);
  };

  const handleRedraft = (newDraft: DraftResponse) => {
    setDraft2(newDraft);
    setView("comparison");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Left sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-100">
          <Scale className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold text-slate-900">Legal RAG</span>
        </div>

        <div className="px-3 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs justify-start"
            onClick={() => { setSelectedDocId(null); setDraft1(null); setView("upload"); }}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload new document
          </Button>
        </div>

        <Separator />

        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Documents
          </p>
          {docsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : documents.length === 0 ? (
            <p className="px-4 py-2 text-xs text-slate-400">No documents yet.</p>
          ) : (
            documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => selectDocument(doc)}
                className={cn(
                  "w-full text-left px-4 py-2 flex items-start gap-2 hover:bg-slate-50 transition-colors",
                  selectedDocId === doc.id && "bg-indigo-50 border-r-2 border-indigo-500",
                )}
              >
                <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{doc.filename}</p>
                  {doc.document_type && (
                    <p className="text-[10px] text-slate-400 capitalize">{doc.document_type}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {isGenerating ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            <p className="text-sm">Generating five-section Case Fact Summary…</p>
          </div>
        ) : view === "comparison" && draft1 && draft2 ? (
          <ComparisonView draft1={draft1} draft2={draft2} onBack={() => setView("draft")} />
        ) : draft1 && document ? (
          <DraftView
            documentId={document.id}
            document={document}
            draft={draft1}
            onRedraft={handleRedraft}
          />
        ) : (
          <UploadView onIngested={handleIngested} />
        )}
      </main>
    </div>
  );
}
