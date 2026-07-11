import { ChevronRight } from "lucide-react";

export function StatCard({ icon: Icon, label, value, sub, color, onClick }: { icon: any; label: string; value: string | number; sub: string; color: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-xl p-5 flex flex-col gap-3 shadow-sm border border-border transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 group" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </div>
      {onClick && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
          자세히 보기 <ChevronRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}
