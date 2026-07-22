import { useNavigate } from "react-router";
import { AlertCircle, AlertTriangle, Calendar, CheckCircle2, Clock, MessageSquare, Plus, RefreshCw, Sparkles } from "lucide-react";
import { AIBox } from "../../../ai/components/AIBox";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { PriorityBadge } from "../../../board/components/PriorityBadge";
import { useAuth } from "../../../global/hooks/useAuth";
import { useDashboardProgress } from "../../libs/hooks/useDashboardProgress";
import { useDashboardTasks } from "../../libs/hooks/useDashboardTasks";
import {
  daysUntilDue,
  formatDashboardDueDate,
  normalizePriority,
  normalizeTaskStatus,
  sourceLabel,
  taskAssignee,
} from "../../libs/utils/dashboardTaskUtils";

export function InProgressPage() {
  const { currentProjectId } = useAuth();
  const { data: tasks, loading, error, refetch } = useDashboardTasks(currentProjectId);
  const { data: progress } = useDashboardProgress(currentProjectId);
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const inProgressTasks = tasks.filter(task => normalizeTaskStatus(task.status) === "inprogress");
  const highPriorityCount = inProgressTasks.filter(task => normalizePriority(task.priority) === "high").length;
  const dueSoonCount = inProgressTasks.filter(task => {
    const days = daysUntilDue(task.dueDate);
    return days != null && days <= 7;
  }).length;
  const riskTaskIds = new Set(progress?.delayRisks.map(risk => risk.taskId) ?? []);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">진행 중 업무 모니터링</h1>
          <p className="text-sm text-muted-foreground mt-0.5">업무 상태가 진행 중인 항목만 표시합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          <button onClick={() => navigate("/board?openAdd=1")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "var(--primary)" }}>
            <Plus className="w-3.5 h-3.5" /> 업무 추가
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="진행 중" value={loading ? "..." : inProgressTasks.length} sub="활성 업무" color="#3B5BDB" icon={Clock} />
        <DetailStatCard label="높은 우선순위" value={loading ? "..." : highPriorityCount} sub="우선 확인" color="#F59E0B" icon={AlertTriangle} />
        <DetailStatCard label="7일 내 마감" value={loading ? "..." : dueSoonCount} sub="일정 확인" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="AI 위험 감지" value={loading ? "..." : riskTaskIds.size} sub="예측 결과" color="#7048E8" icon={Calendar} />
      </div>

      <AIBox text="미구현된 기능입니다." />

      <div className="space-y-3">
        {inProgressTasks.map((task, index) => {
          const member = taskAssignee(task, index);
          const priority = normalizePriority(task.priority);
          const days = daysUntilDue(task.dueDate);
          const isRisk = riskTaskIds.has(task.id);
          const isDueSoon = days != null && days <= 7;
          const borderColor = isRisk ? "#EF4444" : isDueSoon ? "#F59E0B" : "#DFE1E6";
          const bgColor = isRisk ? "rgba(239,68,68,0.03)" : isDueSoon ? "rgba(245,158,11,0.03)" : "white";

          return (
            <div key={task.id} className="rounded-xl shadow-sm overflow-hidden border" style={{ borderColor, borderLeftWidth: 4, background: bgColor }}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: member.color }}>
                      {member.initials}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{task.id}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{task.category ?? "미분류"}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{sourceLabel(task.sourceType)}</span>
                        {isRisk && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">AI 지연 위험</span>}
                      </div>
                      <div className="text-sm font-semibold text-foreground">{task.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{member.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold bg-muted px-2 py-1 rounded-lg ${isDueSoon ? "text-amber-600" : "text-foreground"}`}>
                      마감 {formatDashboardDueDate(task.dueDate)}
                    </span>
                  </div>
                </div>

                {task.description && (
                  <div className="text-xs text-muted-foreground mb-3 px-3 py-2 rounded-lg bg-muted/60 border border-border">
                    {task.description}
                  </div>
                )}

                <div className="flex items-center flex-wrap gap-2 pt-3 border-t border-border">
                  <button onClick={() => navigate("/board")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 보드에서 완료 처리
                  </button>
                  <button onClick={() => navigate("/board")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> 블로커 전환
                  </button>
                  <button onClick={() => navigate("/board")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> 댓글
                  </button>
                  <button onClick={() => navigate("/dashboard/dash-progress")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ml-auto transition-opacity hover:opacity-80" style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" /> AI 분석 보기
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {(loading || inProgressTasks.length === 0) && (
          <div className="h-40 flex items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
            {loading ? "데이터를 불러오는 중입니다" : "진행 중인 업무가 없습니다."}
          </div>
        )}
      </div>
    </div>
  );
}
