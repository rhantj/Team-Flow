export function DelivBadge({ status }: { status: string }) {
  const m: Record<string,string> = { done:"bg-emerald-100 text-emerald-600", draft:"bg-blue-100 text-blue-600", pending:"bg-slate-100 text-slate-500" };
  const l: Record<string,string> = { done:"완료", draft:"초안", pending:"생성 전" };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m[status]??m.pending}`}>{l[status]??status}</span>;
}
