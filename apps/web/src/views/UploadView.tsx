import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { IngestResponse } from "@/lib/types";
import { toast } from "sonner";

const STAGES = ["Uploading file…", "Extracting text…", "Generating embeddings…", "Saving document…"];
const STAGE_MS = [800, 2000, 3000, 1000];

interface UploadViewProps {
  onIngested: (result: IngestResponse) => void;
}

export function UploadView({ onIngested }: UploadViewProps) {
  const [dragging, setDragging] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (file: File) => api.ingestDocument(file),
    onMutate: () => {
      setStageIdx(0);
      let idx = 0;
      const advance = () => {
        idx++;
        if (idx < STAGES.length) {
          setStageIdx(idx);
          setTimeout(advance, STAGE_MS[idx] ?? 1000);
        }
      };
      setTimeout(advance, STAGE_MS[0] ?? 800);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success(`Ingested ${result.chunkCount} chunks — ${(result.ocrConfidence * 100).toFixed(0)}% OCR confidence`);
      onIngested(result);
    },
    onError: (err: Error) => {
      toast.error(`Ingestion failed: ${err.message}`);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(pdf|png|jpg|jpeg)$/i)) {
        toast.error("Only PDF, PNG, JPG files are accepted.");
        return;
      }
      mutate(file);
    },
    [mutate],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
      <Card className="w-full max-w-lg border-slate-200">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <FileText className="h-10 w-10 text-indigo-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-slate-900">Ingest a legal document</h2>
            <p className="text-sm text-slate-500 mt-1">
              Upload a PDF, PNG, or JPG. The system will extract text, chunk it, and generate embeddings.
            </p>
          </div>

          {isPending ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <p className="text-sm text-slate-600">{STAGES[stageIdx]}</p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${((stageIdx + 1) / STAGES.length) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-3 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              <Upload className="h-7 w-7 text-slate-400" />
              <div className="text-center">
                <span className="text-sm font-medium text-indigo-600">Browse file</span>
                <span className="text-sm text-slate-500"> or drag and drop</span>
              </div>
              <p className="text-xs text-slate-400">PDF · PNG · JPG up to 50 MB</p>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={onInputChange}
              />
            </label>
          )}

          {!isPending && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
              >
                Pick file
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
