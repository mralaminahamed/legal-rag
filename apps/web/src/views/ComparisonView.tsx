import { diffWords } from "diff";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SECTIONS, SECTION_LABELS, type DraftResponse } from "@/lib/types";

interface ComparisonViewProps {
  draft1: DraftResponse;
  draft2: DraftResponse;
  onBack: () => void;
}

function WordDiff({ original, edited }: { original: string; edited: string }) {
  const CITE_RE = /\[c:[0-9a-f-]+\]/g;
  const clean = (t: string) => t.replace(CITE_RE, "");
  const changes = diffWords(clean(original), clean(edited));

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {changes.map((part, i) => {
        if (part.added) return <mark key={i} className="bg-green-100 text-green-900 rounded-sm">{part.value}</mark>;
        if (part.removed) return <del key={i} className="bg-red-100 text-red-700 line-through rounded-sm">{part.value}</del>;
        return <span key={i} className="text-slate-700">{part.value}</span>;
      })}
    </p>
  );
}

function editDistance(a: string, b: string): number {
  const CITE_RE = /\[c:[0-9a-f-]+\]/g;
  return diffWords(a.replace(CITE_RE, ""), b.replace(CITE_RE, ""))
    .reduce((n, p) => n + (p.added || p.removed ? (p.count ?? 1) : 0), 0);
}

export function ComparisonView({ draft1, draft2, onBack }: ComparisonViewProps) {
  const totalDist1 = SECTIONS.reduce((s, k) => {
    const s1 = draft1.sections[k]; const s2 = draft2.sections[k];
    return s + (s1 && s2 ? editDistance(s1.content, s2.content) : 0);
  }, 0);

  const meanGround1 = SECTIONS.reduce((s, k) => s + (draft1.sections[k]?.groundingScore ?? 0), 0) / SECTIONS.length;
  const meanGround2 = SECTIONS.reduce((s, k) => s + (draft2.sections[k]?.groundingScore ?? 0), 0) / SECTIONS.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-100 bg-white">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to draft
        </Button>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span>
            Grounding: <strong className="text-slate-900">{(meanGround1 * 100).toFixed(0)}%</strong>
            {" → "}
            <strong className={meanGround2 >= meanGround1 ? "text-green-700" : "text-red-700"}>
              {(meanGround2 * 100).toFixed(0)}%
            </strong>
          </span>
          <span>
            Edit distance from draft 1: <strong className="text-slate-900">{totalDist1} words</strong>
          </span>
        </div>
      </div>

      {/* Two-column comparison */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-0 min-h-full">
          {/* Draft 1 header */}
          <div className="px-6 py-3 border-b border-r border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Draft 1</span>
            <span className="ml-2 text-xs text-slate-400">via {draft1.providerUsed}</span>
          </div>
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Draft 2</span>
            <span className="ml-2 text-xs text-slate-400">with edit-loop signals</span>
          </div>

          {/* Sections */}
          {SECTIONS.map((section) => {
            const s1 = draft1.sections[section];
            const s2 = draft2.sections[section];
            const dist = s1 && s2 ? editDistance(s1.content, s2.content) : 0;

            return [
              /* Draft 1 cell */
              <div key={`${section}-1`} className="px-6 py-4 border-b border-r border-slate-100">
                <Card className="border-slate-100 shadow-none">
                  <CardHeader className="py-2 px-3 border-b border-slate-50">
                    <CardTitle className="text-xs text-slate-400 uppercase tracking-wide">
                      {SECTION_LABELS[section]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {s1?.content ?? <span className="italic text-slate-400">—</span>}
                    </p>
                  </CardContent>
                </Card>
              </div>,

              /* Draft 2 cell with diff */
              <div key={`${section}-2`} className="px-6 py-4 border-b border-slate-100">
                <Card className="border-indigo-100 shadow-none">
                  <CardHeader className="py-2 px-3 border-b border-indigo-50 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs text-indigo-500 uppercase tracking-wide">
                      {SECTION_LABELS[section]}
                    </CardTitle>
                    {dist > 0 && (
                      <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-200">
                        {dist} words changed
                      </span>
                    )}
                  </CardHeader>
                  <CardContent className="p-3">
                    {s1 && s2
                      ? <WordDiff original={s1.content} edited={s2.content} />
                      : <p className="text-sm text-slate-600">{s2?.content}</p>
                    }
                  </CardContent>
                </Card>
              </div>,
            ];
          })}
        </div>
      </div>
    </div>
  );
}
