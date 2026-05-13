import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "@/components/SectionCard";
import { EditView } from "./EditView";
import { api } from "@/lib/api-client";
import { SECTIONS, SECTION_LABELS, type Section, type DraftResponse, type DocumentDetail } from "@/lib/types";
import { toast } from "sonner";

interface DraftViewProps {
  documentId: string;
  document: DocumentDetail;
  draft: DraftResponse;
  onRedraft: (newDraft: DraftResponse) => void;
}

export function DraftView({ documentId, document, draft, onRedraft }: DraftViewProps) {
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const qc = useQueryClient();

  const { mutate: redraft, isPending: isRedrafting } = useMutation({
    mutationFn: () => api.generateDraft(documentId),
    onSuccess: (newDraft) => {
      qc.invalidateQueries({ queryKey: ["draft", documentId] });
      toast.success("Draft 2 generated — opening comparison view");
      onRedraft(newDraft);
    },
    onError: (err: Error) => toast.error(`Re-generate failed: ${err.message}`),
  });

  const parties = document.parties;
  const dates = document.key_dates ?? [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Document meta bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-100 bg-white text-xs text-slate-600">
        <span className="font-medium text-slate-800 truncate max-w-xs">{document.filename}</span>
        {document.document_type && (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">
            {document.document_type}
          </span>
        )}
        {parties && parties.plaintiffs.length > 0 && (
          <span className="hidden lg:block truncate">
            <span className="text-slate-400">Plaintiff: </span>{parties.plaintiffs.join(", ")}
          </span>
        )}
        {parties && parties.defendants.length > 0 && (
          <span className="hidden lg:block truncate">
            <span className="text-slate-400">Defendant: </span>{parties.defendants.join(", ")}
          </span>
        )}
        {dates.length > 0 && (
          <span className="hidden xl:block text-slate-400">{dates.length} key dates</span>
        )}
        <span className="text-slate-400 ml-auto">via {draft.providerUsed}</span>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {SECTIONS.map((section) => {
          const sectionDraft = draft.sections[section];
          if (!sectionDraft) return null;
          return (
            <SectionCard
              key={section}
              title={SECTION_LABELS[section]}
              section={sectionDraft}
              onEdit={() => setEditingSection(section)}
            />
          );
        })}

        <Separator className="my-4" />

        <div className="flex justify-end pb-2">
          <Button
            onClick={() => redraft()}
            disabled={isRedrafting}
            className="gap-2"
          >
            {isRedrafting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-generate draft
          </Button>
        </div>
      </div>

      {/* Edit modal */}
      {editingSection && draft.sections[editingSection] && (
        <EditView
          draftId={draft.sections[editingSection]!.draftId}
          section={editingSection}
          currentContent={draft.sections[editingSection]!.content}
          onClose={() => setEditingSection(null)}
        />
      )}
    </div>
  );
}
