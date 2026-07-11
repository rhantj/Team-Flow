import type { Priority } from "../libs/types/task";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const map = {
    high: { label: "높음", cls: "bg-red-50 text-red-600" },
    medium: { label: "중간", cls: "bg-amber-50 text-amber-600" },
    low: { label: "낮음", cls: "bg-slate-100 text-slate-500" },
  };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${map[priority].cls}`}>{map[priority].label}</span>;
}
