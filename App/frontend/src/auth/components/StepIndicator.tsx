export function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i < current ? "bg-blue-600" : i === current ? "bg-blue-400" : "bg-border"}`}
          style={{ width: i === current ? 28 : 12 }} />
      ))}
    </div>
  );
}
