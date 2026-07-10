import { ArrowLeft } from "lucide-react";

export function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group mb-3">
      <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
      대시보드로 돌아가기
    </button>
  );
}
