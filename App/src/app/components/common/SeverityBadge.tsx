export function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  const map = {
    high:   "bg-red-100 text-red-700 border border-red-200",
    medium: "bg-amber-100 text-amber-700 border border-amber-200",
    low:    "bg-slate-100 text-slate-600 border border-slate-200",
  };
  const labels = { high: "심각도 높음", medium: "심각도 보통", low: "심각도 낮음" };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[severity]}`}>{labels[severity]}</span>;
}
