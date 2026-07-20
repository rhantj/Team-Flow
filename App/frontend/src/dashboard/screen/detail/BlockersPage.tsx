import { useNavigate } from "react-router";
import { AlertCircle, AlertTriangle, Calendar, CheckCheck, Clock, Layers, MessageSquare, Plus, Sparkles } from "lucide-react";
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

export function BlockersPage() {
  const { currentProjectId } = useAuth();
  const { data: tasks, loading, error } = useDashboardTasks(currentProjectId);
  const { data: progress } = useDashboardProgress(currentProjectId);
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const blockedTasks = tasks.filter(task => normalizeTaskStatus(task.status) === "blocked");
  const highPriorityCount = blockedTasks.filter(task => normalizePriority(task.priority) === "high").length;
  const dueSoonCount = blockedTasks.filter(task => {
    const days = daysUntilDue(task.dueDate);
    return days != null && days <= 7;
  }).length;
  const riskTaskIds = new Set(progress?.delayRisks.map(risk => risk.taskId) ?? []);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">블로커 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">업무 상태가 블로커인 항목을 확인합니다.</p>
        </div>
        <button onClick={() => navigate("/board?openAdd=1")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
          <Plus className="w-3.5 h-3.5" /> 업무 추가
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="현재 블로커" value={loading ? "..." : blockedTasks.length} sub="해결 대기" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="높은 우선순위" value={loading ? "..." : highPriorityCount} sub="즉시 조치 필요" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="7일 내 마감" value={loading ? "..." : dueSoonCount} sub="일정 영향 가능" color="#F59E0B" icon={Clock} />
        <DetailStatCard label="AI 위험 감지" value="미구현" sub="예측 결과" color="#7048E8" icon={Layers} />
      </div>

      <AIBox text="미구현된 기능입니다." />

      <div className="space-y-4">
        {blockedTasks.map((task, index) => {
          const assignee = taskAssignee(task, index);
          const priority = normalizePriority(task.priority);
          const days = daysUntilDue(task.dueDate);
          const isRisk = riskTaskIds.has(task.id);
          return (
            <div key={task.id} className="bg-card rounded-xl border-2 border-red-200 shadow-sm overflow-hidden">
              <div className="flex items-start justify-between px-5 py-3.5 border-b border-red-100 bg-red-50/50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      <PriorityBadge priority={priority} />
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{task.category ?? "미분류"}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{task.id}</span>
                      {isRisk && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">AI 지연 위험</span>}
                    </div>
                    <div className="text-sm font-semibold text-foreground">{task.title}</div>
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-red-100 text-red-700 shrink-0 whitespace-nowrap">
                  {days == null ? "마감 미정" : days < 0 ? `D+${Math.abs(days)}` : `D-${days}`}
                </span>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">블로커 내용</div>
                  <p className="text-sm text-foreground leading-relaxed">{task.description || "등록된 설명이 없습니다. 업무 보드에서 상세 내용을 추가하세요."}</p>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">담당자</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: assignee.color }}>{assignee.initials}</div>
                      <span className="text-xs font-medium text-foreground">{assignee.name}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">마감일</div>
                    <span className="text-xs text-foreground">{formatDashboardDueDate(task.dueDate)}</span>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">출처</div>
                    <span className="text-xs text-foreground">{sourceLabel(task.sourceType)}</span>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">우선순위</div>
                    <PriorityBadge priority={priority} />
                  </div>
                </div>

                {isRisk && (
                  <div className="rounded-lg p-3 flex items-start gap-2.5 border" style={{ background: "rgba(112,72,232,0.05)", borderColor: "rgba(112,72,232,0.2)" }}>
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#7048E8" }} />
                    <p className="text-xs leading-relaxed" style={{ color: "#5B3DC8" }}>AI 지연 위험 분석에 포함된 업무입니다. 진행률 상세에서 최신 예측 결과를 확인하세요.</p>
                  </div>
                )}

                <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-border">
                  <button onClick={() => navigate("/board")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-red-500 hover:bg-red-600 transition-colors">
                    <CheckCheck className="w-3.5 h-3.5" /> 보드에서 해결 처리
                  </button>
                  <button onClick={() => navigate("/board")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> 마감 조정
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
        {(loading || blockedTasks.length === 0) && (
          <div className="h-40 flex items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
            {loading ? "데이터를 불러오는 중입니다" : "현재 블로커 업무가 없습니다."}
          </div>
        )}
      </div>
    </div>
  );
}
