import { useNavigate } from "react-router";
import { BackBtn } from "../../../components/common/BackBtn";
import { SeverityBadge } from "../../../components/common/SeverityBadge";
import { TASKS } from "../../../data/tasks";
import { MEMBERS } from "../../../data/members";
import { BLOCKER_DETAILS } from "../../../data/blockers";
import {
  Sparkles,
  Plus,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCheck,
  Layers,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

export function BlockersPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">블로커 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">막힌 업무를 파악하고 해결 담당자와 기한을 지정해 위험을 제거합니다.</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
          <Plus className="w-3.5 h-3.5" /> 블로커 추가
        </button>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="현재 블로커" value={BLOCKER_DETAILS.length} sub="해결 대기" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="심각도 높음" value="2" sub="즉각 조치 필요" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="평균 지연" value="3.5일" sub="발생일 기준" color="#F59E0B" icon={Clock} />
        <DetailStatCard label="영향받는 업무" value="3개" sub="연쇄 지연 위험" color="#7048E8" icon={Layers} />
      </div>

      {/* AI box */}
      <AIBox
        text="BL-01(DB 인덱싱)이 4일째 팀 내 결정 부재로 지속 중입니다. 오늘 30분 긴급 결정 미팅을 강력 추천합니다. BL-02는 axios 인터셉터 전환으로 해결 가능성이 높습니다."
        onAsk={() => {}}
      />

      {/* blocker cards */}
      <div className="space-y-4">
        {BLOCKER_DETAILS.map(b => {
          const assignee = MEMBERS.find(m => m.id === b.assignee)!;
          const resolver = b.resolver ? MEMBERS.find(m => m.id === b.resolver) : null;
          const affected = TASKS.filter(t => b.affectedTaskIds.includes(t.id));
          return (
            <div key={b.id} className="bg-card rounded-xl border-2 border-red-200 shadow-sm overflow-hidden">
              {/* card header */}
              <div className="flex items-start justify-between px-5 py-3.5 border-b border-red-100 bg-red-50/50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      <SeverityBadge severity={b.severity} />
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{b.type}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{b.id} · {b.taskId}</span>
                    </div>
                    <div className="text-sm font-semibold text-foreground">{b.title}</div>
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-red-100 text-red-700 shrink-0 whitespace-nowrap">{b.daysSince}일째 지속</span>
              </div>

              {/* card body */}
              <div className="px-5 py-4 space-y-4">
                {/* reason */}
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">막힌 이유</div>
                  <p className="text-sm text-foreground leading-relaxed">{b.reason}</p>
                </div>

                {/* meta */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">담당자</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: assignee.color }}>{assignee.initials}</div>
                      <span className="text-xs font-medium text-foreground">{assignee.name}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">해결 담당자</div>
                    {resolver ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: resolver.color }}>{resolver.initials}</div>
                        <span className="text-xs font-medium text-foreground">{resolver.name}</span>
                      </div>
                    ) : (
                      <button className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                        <Plus className="w-3 h-3" /> 지정하기
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">발생일</div>
                    <span className="text-xs text-foreground">{b.createdAt}</span>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">연결 참고</div>
                    <button className="text-xs text-blue-600 hover:text-blue-700 underline">{b.link}</button>
                  </div>
                </div>

                {/* affected tasks */}
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">영향받는 업무</div>
                  <div className="flex flex-wrap gap-2">
                    {affected.map(t => (
                      <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs">
                        <span className="font-mono text-muted-foreground">{t.id}</span>
                        <span className="text-foreground truncate max-w-[150px]">{t.title}</span>
                        <TaskStatusPill status={t.status} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI suggestion */}
                <div className="rounded-lg p-3 flex items-start gap-2.5 border" style={{ background: "rgba(112,72,232,0.05)", borderColor: "rgba(112,72,232,0.2)" }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#7048E8" }} />
                  <p className="text-xs leading-relaxed" style={{ color: "#5B3DC8" }}>{b.aiSuggestion}</p>
                </div>

                {/* actions */}
                <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-border">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-red-500 hover:bg-red-600 transition-colors">
                    <CheckCheck className="w-3.5 h-3.5" /> 해결 완료
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> 회의 안건 추가
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <Plus className="w-3.5 h-3.5" /> 관련 업무 생성
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> 팀 코멘트
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ml-auto transition-opacity hover:opacity-80"
                    style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" /> AI 해결 방법 추천
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── page 4: in-progress tasks ────────────────────────────────────────────────
