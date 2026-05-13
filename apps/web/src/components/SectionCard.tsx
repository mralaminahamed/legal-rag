import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { CitationBadge } from "./CitationBadge";
import type { SectionDraft } from "@/lib/types";

const CITE_RE = /\[c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;

function renderContent(content: string, draftId: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(CITE_RE.source, "g");

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`text-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>,
      );
    }
    const chunkId = match[1]!;
    nodes.push(<CitationBadge key={`cite-${match.index}`} chunkId={chunkId} draftId={draftId} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
  }
  return nodes;
}

interface SectionCardProps {
  title: string;
  section: SectionDraft;
  onEdit: () => void;
}

export function SectionCard({ title, section, onEdit }: SectionCardProps) {
  const grounding = Math.round(section.groundingScore * 100);
  const isRefusal = section.content.startsWith("Not specified");

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </CardTitle>
          {!isRefusal && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                grounding >= 70
                  ? "bg-green-50 text-green-700 border-green-200"
                  : grounding >= 50
                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {grounding}% grounded
            </span>
          )}
        </div>
        {!isRefusal && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2 text-xs gap-1">
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {isRefusal ? (
          <p className="text-sm text-slate-400 italic">{section.content}</p>
        ) : (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {renderContent(section.content, section.draftId)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
