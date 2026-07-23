export function DetailStatCard({ label, value, sub, color, icon: Icon, iconBorder = false }: { label: string; value: string | number; sub: string; color: string; icon: any; iconBorder?: boolean }) {
  return (
    <div className="bg-card rounded-xl p-4 flex items-center gap-3 shadow-sm border border-border">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, ...(iconBorder ? { border: `1px solid ${color}` } : {}) }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground leading-none">{value}</div>
        <div className="text-xs font-medium text-foreground mt-0.5">{label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
