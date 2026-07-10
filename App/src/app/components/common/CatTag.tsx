import { getCat } from "../../services/taskService";

export function CatTag({ catId }: { catId: string }) {
  const cat = getCat(catId);
  const Icon = cat.icon;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: cat.bg, color: cat.color }}>
      <Icon className="w-2.5 h-2.5 shrink-0" />{cat.label}
    </span>
  );
}
