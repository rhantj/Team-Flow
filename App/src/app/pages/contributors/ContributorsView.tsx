import { CheckCircle2, Shield } from "lucide-react";

export function ContributorsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <Shield className="w-8 h-8 text-white" />
      </div>
      <div>
        <div className="text-base font-semibold text-foreground">심사자 전용 기능</div>
        <div className="text-sm text-muted-foreground mt-1 max-w-xs">개인별 기여도 분석 리포트는 심사자 계정으로만 접근할 수 있습니다.</div>
      </div>
      <div className="bg-card rounded-xl p-5 border border-border shadow-sm max-w-md w-full text-left">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">심사자 전용 데이터</div>
        <div className="space-y-2">
          {["개인별 To-Do 완료율 및 마감 준수율", "회의록 내 발언 및 결정 참여 이력", "GitHub 커밋/PR/리뷰 기여 기록", "문서 및 산출물 작성 기여 이력", "AI 기여도 근거 요약 (출처 포함)"].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI assistant panel ───────────────────────────────────────────────────────
