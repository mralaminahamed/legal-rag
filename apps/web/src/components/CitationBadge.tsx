import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api-client";

interface CitationBadgeProps {
  chunkId: string;
  draftId: string;
}

export function CitationBadge({ chunkId, draftId }: CitationBadgeProps) {
  const shortId = chunkId.slice(0, 8);

  const { data } = useQuery({
    queryKey: ["citations", draftId],
    queryFn: () => api.getDraftCitations(draftId),
    staleTime: Infinity,
  });

  const citation = data?.citations.find((c) => c.chunk_id === chunkId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-mono leading-none
                     bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100
                     cursor-pointer align-middle mx-0.5"
        >
          c:{shortId}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 text-xs space-y-1.5" side="top">
        <div className="font-medium text-slate-900">Source chunk</div>
        <div className="text-slate-600 leading-relaxed">
          {citation ? citation.snippet : <span className="text-slate-400 italic">loading…</span>}
        </div>
        {citation && (
          <div className="text-slate-400">
            Retrieval score: {(citation.score * 100).toFixed(0)}%
          </div>
        )}
        <div className="font-mono text-slate-300 truncate">{chunkId}</div>
      </PopoverContent>
    </Popover>
  );
}
