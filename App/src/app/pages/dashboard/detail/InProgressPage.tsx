import { useNavigate } from "react-router";
import { BackBtn } from "../../../components/common/BackBtn";
import { TaskStatusPill } from "../../../components/common/TaskStatusPill";
import { PriorityBadge } from "../../../components/common/PriorityBadge";
import { TASKS, IN_PROGRESS_META } from "../../../data/tasks";
import { MEMBERS } from "../../../data/members";
import {
  Sparkles,
  Bell,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  ArrowRight,
  AlertCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

export function InProgressPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const inProgressTasks = TASKS.filter(t => t.status === "inprogress");

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">진행 중 업무 모니터링</h1>
          <p className="text-sm text-muted-foreground mt-0.5">현재 진행 중인 업무 상태를 파악하고 지연 가능성을 조기에 감지합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 전체 업데이트 요청
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "var(--primary)" }}>
            <Plus className="w-3.5 h-3.5" /> 업무 추가
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="진행 중" value={inProgressTasks.length} sub="활성 업무" color="#3B5BDB" icon={Clock} />
        <DetailStatCard label="업데이트 필요" value="2" sub="3일 이상 미업데이트" color="#F59E0B" icon={AlertTriangle} />
        <DetailStatCard label="지연 위험" value="1" sub="고위험 업무" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="마감까지" value="D-18" sub="2024.12.28" color="#7048E8" icon={Calendar} />
      </div>

      {/* AI box */}
      <AIBox
        text="TF-07(관리자 대시보드)이 3일간 업데이트가 없습니다. 이서연님께 진행 상황 업데이트를 요청하세요. TF-05(결제 연동)의 블로커를 오늘 해결해야 마감 일정을 지킬 수 있습니다."
        onAsk={() => {}}
      />

      {/* legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        {[
          { color: "#EF4444", label: "지연 위험" },
          { color: "#F59E0B", label: "업데이트 필요 (3일↑)" },
          { color: "#3B5BDB", label: "정상 진행" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* task cards */}
      <div className="space-y-3">
        {inProgressTasks.map(task => {
          const member = MEMBERS.find(m => m.id === task.assignee)!;
          const meta = IN_PROGRESS_META[task.id] ?? { startDate: "12.01", lastUpdate: "오늘", stale: false, riskLevel: "low" as const, nextAction: "진행 중", note: "" };
          const borderColor = meta.riskLevel === "high" ? "#EF4444" : meta.stale ? "#F59E0B" : "#DFE1E6";
          const bgColor    = meta.riskLevel === "high" ? "rgba(239,68,68,0.03)" : meta.stale ? "rgba(245,158,11,0.03)" : "white";

          return (
            <div key={task.id} className="rounded-xl shadow-sm overflow-hidden border"
              style={{ borderColor, borderLeftWidth: 4, background: bgColor }}>
              <div className="p-5">
                {/* top row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: member.color }}>
                      {member.initials}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{task.id}</span>
                        {task.labels.map(l => <LabelBadge key={l} label={l} />)}
                        {meta.riskLevel === "high" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">지연 위험</span>
                        )}
                        {meta.stale && meta.riskLevel !== "high" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">업데이트 필요</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-foreground">{task.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{member.name} · 시작 {meta.startDate}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-lg ${meta.stale ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      마지막 업데이트 {meta.lastUpdate}
                    </span>
                    <span className="text-xs font-semibold text-foreground bg-muted px-2 py-1 rounded-lg">
                      마감 {task.dueDate}
                    </span>
                  </div>
                </div>

                {/* note */}
                {meta.note && (
                  <div className="text-xs text-muted-foreground mb-3 px-3 py-2 rounded-lg bg-muted/60 border border-border">
                    {meta.note}
                  </div>
                )}

                {/* next action */}
                <div className="flex items-center gap-2 mb-4 text-xs">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">다음 액션</span>
                  <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="text-foreground">{meta.nextAction}</span>
                </div>

                {/* actions */}
                <div className="flex items-center flex-wrap gap-2 pt-3 border-t border-border">
                  {meta.stale && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors">
                      <Bell className="w-3.5 h-3.5" /> 업데이트 요청
                    </button>
                  )}
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 완료 처리
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> 블로커 전환
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> 코멘트
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> 마감 조정
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ml-auto transition-opacity hover:opacity-80"
                    style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" /> AI에게 질문
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

// ─── page 5: dash progress ────────────────────────────────────────────────────
