export function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    "직접 생성": "bg-slate-100 text-slate-500",
    "회의록 AI": "bg-purple-100 text-purple-600",
    "GitHub":   "bg-gray-800 text-gray-100",
  };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${map[source] ?? "bg-slate-100 text-slate-500"}`}>{source}</span>;
}
