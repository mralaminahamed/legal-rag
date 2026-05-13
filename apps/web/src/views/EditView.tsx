import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { SECTION_LABELS, type Section } from "@/lib/types";
import { toast } from "sonner";

interface EditViewProps {
  draftId: string;
  section: Section;
  currentContent: string;
  onClose: () => void;
}

export function EditView({ draftId, section, currentContent, onClose }: EditViewProps) {
  const [editedText, setEditedText] = useState(currentContent);
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.submitEdit(draftId, section, editedText),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["draft"] });
      toast.success(
        `Edit submitted — class: ${result.classification.class}, signal: ${result.signalScore.toFixed(2)}${result.promotedToExemplar ? " · promoted to exemplar" : ""}`,
      );
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Edit failed: ${err.message}`);
    },
  });

  const isDirty = editedText !== currentContent;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Edit — {SECTION_LABELS[section]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Citation markers <code className="bg-slate-100 px-1 rounded">[c:UUID]</code> are preserved as plain text.
            The system will diff your edit, classify it, and store the signal for future drafts.
          </p>
          <Textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="min-h-48 text-sm font-mono resize-y"
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutate()}
            disabled={!isDirty || isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
