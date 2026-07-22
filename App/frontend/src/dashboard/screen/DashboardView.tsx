import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Columns3,
  Layers,
  Package,
  Plus,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { Avatar } from "../../global/component/Avatar";
import { StatCard } from "../../global/component/StatCard";
import { StatusIcon } from "../../global/component/StatusIcon";
import { NAV_ITEMS } from "../../global/lib/constants/nav";
import { useAuth } from "../../global/hooks/useAuth";
import type { DetailPage } from "../../board/libs/types/task";
import { useDashboardProgress } from "../libs/hooks/useDashboardProgress";
import { useDashboardSummary } from "../libs/hooks/useDashboardSummary";
import { activityMessage, activityTypeLabel, formatRelativeTime } from "../libs/utils/activityDisplay";
import { formatDashboardDueDate, isDelayRisk, normalizeTaskStatus } from "../libs/utils/dashboardTaskUtils";
import { resolveMemberDisplay } from "../libs/utils/memberDisplay";
import { openAIAssistant } from "../../ai/libs/utils/openAIAssistant";

function EmptyState({ children }: { children: string }) {
  return <div className="py-8 text-center text-xs text-muted-foreground">{children}</div>;
}

export function DashboardView() {
  const navigate = useNavigate();
  const onCardClick = (p: DetailPage) => navigate(`/dashboard/${p}`);
  const { currentProjectId } = useAuth();
  const { data: summary, loading: summaryLoading, error: summaryError } = useDashboardSummary(currentProjectId);
  const { data: progress, loading: progressLoading, error: progressError } = useDashboardProgress(currentProjectId);

  const deliverablesActive = NAV_ITEMS.find((item) => item.id === "deliverables")?.activate !== false;
  const isSummaryPending = summaryLoading && !summary;
  const isProgressPending = progressLoading && !progress;
  const totalTasks = summary?.totalTasks ?? 0;
  const doneTasks = summary?.doneTasks ?? 0;
  const progressPct = summary?.progressPercent ?? 0;
  const blockedTasks = summary?.blockedTasks ?? 0;
  const inProgressTasks = summary?.inProgressTasks ?? 0;
  const workload = summary?.workload ?? [];
  const upcomingDeadlines = summary?.upcomingDeadlines ?? [];
  const recentActivity = summary?.recentActivity ?? [];
  const categoryChart = progress?.categoryBreakdown.map((item) => ({
    category: item.category,
    done: item.done,
    remaining: Math.max(item.total - item.done, 0),
  })) ?? [];
  const delayRiskCount = progress?.delayRisks.filter(risk => isDelayRisk(risk.result)).length ?? 0;
  const dashboardQuestion = `현재 프로젝트 대시보드를 요약해줘. 전체 업무 ${totalTasks}개, 완료 ${doneTasks}개, 완료율 ${progressPct}%, 블로커 ${blockedTasks}개, 진행 중 ${inProgressTasks}개, 지연 주의·위험 업무 ${delayRiskCount}개야. 가장 먼저 처리할 일과 다음 액션을 알려줘.`;

  const quickActions = [
    { label: "업무 추가", icon: Plus, color: "#3B5BDB", onClick: () => navigate("/board?openAdd=1") },
    { label: "회의록 업로드", icon: Upload, color: "#7048E8", onClick: () => navigate("/meetings?upload=1") },
    ...(deliverablesActive ? [{ label: "산출물", icon: Package, color: "#0F766E", onClick: () => navigate("/deliverables") }] : []),
    { label: "AI 어시스턴트", icon: Sparkles, color: "#F59E0B", onClick: () => openAIAssistant() },
    { label: "업무 보드", icon: Columns3, color: "#0EA5E9", onClick: () => navigate("/board") },
    { label: "전체 업무", icon: Users, color: "#EC4899", onClick: () => navigate("/dashboard/all-tasks") },
    { label: "마감 임박", icon: Clock, color: "#EF4444", onClick: () => navigate("/dashboard/urgent") },
  ];

  if (currentProjectId == null) {
    return (
      <div className="h-full p-6 flex items-center justify-center text-sm text-muted-foreground">
        프로젝트를 선택하면 Supabase에 저장된 대시보드 데이터가 표시됩니다.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {(summaryError || progressError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          데이터를 불러오지 못했습니다. {summaryError ?? progressError}
        </div>
      )}

      <div className="rounded-xl p-4 flex items-start gap-3 border border-border bg-card shadow-sm">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(112,72,232,0.12)" }}>
          <Sparkles className="w-4 h-4" style={{ color: "#7048E8" }} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">AI 추천 액션</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {blockedTasks > 0
              ? `블로커 ${blockedTasks}개와 지연 주의·위험 업무 ${delayRiskCount}개를 우선 점검해 보세요.`
              : `완료율 ${progressPct}% 기준으로 다음 우선순위와 일정 위험을 점검할 수 있습니다.`}
          </div>
        </div>
        <button onClick={() => openAIAssistant(dashboardQuestion)} className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-80" style={{ background: "rgba(112,72,232,0.15)", color: "#7048E8" }}>
          AI에게 질문
        </button>
      </div>

      <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
        <div className="text-sm font-semibold text-foreground mb-3">빠른 액션</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {quickActions.map(action => {
            const Icon = action.icon;
            return (
              <button key={action.label} onClick={action.onClick} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card hover:shadow-sm hover:border-slate-300 transition-all text-left">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${action.color}18` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: action.color }} />
                </div>
                <span className="text-xs font-medium text-foreground leading-tight">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={Layers} label="전체 업무" value={isSummaryPending ? "..." : totalTasks} sub={isSummaryPending ? "불러오는 중" : `완료 ${doneTasks}개`} color="#3B5BDB" onClick={() => onCardClick("all-tasks")} />
        <StatCard icon={TrendingUp} label="완료율" value={isSummaryPending ? "..." : `${progressPct}%`} sub={isSummaryPending ? "불러오는 중" : "실제 업무 기준"} color="#10B981" onClick={() => onCardClick("progress")} />
        <StatCard icon={AlertTriangle} label="블로커" value={isSummaryPending ? "..." : blockedTasks} sub={isSummaryPending ? "불러오는 중" : "즉시 해결 필요"} color="#EF4444" onClick={() => onCardClick("blockers")} />
        <StatCard icon={Clock} label="진행 중" value={isSummaryPending ? "..." : inProgressTasks} sub={isSummaryPending ? "불러오는 중" : "활성 업무"} color="#F59E0B" onClick={() => onCardClick("inprogress")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div onClick={() => onCardClick("dash-progress")} className="lg:col-span-2 bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-foreground">카테고리별 진행</div>
              <div className="text-xs text-muted-foreground mt-0.5">업무 카테고리 기준</div>
            </div>
            <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{summaryLoading ? "..." : progressPct}%</div>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-4">
            <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%`, background: "linear-gradient(90deg, #3B5BDB, #7048E8)" }} />
          </div>
          <div className="h-40">
            {isProgressPending ? (
              <EmptyState>데이터를 불러오는 중입니다</EmptyState>
            ) : categoryChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChart} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Bar dataKey="done" stackId="tasks" name="완료" fill="#10B981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="remaining" stackId="tasks" name="미완료" fill="#C1C9D9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState>표시할 카테고리 데이터가 없습니다.</EmptyState>
            )}
          </div>
        </div>

        <div onClick={() => onCardClick("urgent")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">마감 임박 업무</div>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {isSummaryPending ? (
              <EmptyState>데이터를 불러오는 중입니다</EmptyState>
            ) : upcomingDeadlines.length ? upcomingDeadlines.map((task, index) => {
              const member = resolveMemberDisplay(task.assigneeName, index);
              return (
                <div key={task.id} className="flex items-center gap-2.5">
                  <StatusIcon status={normalizeTaskStatus(task.status)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                    <div className="text-[10px] text-muted-foreground">마감 {formatDashboardDueDate(task.dueDate)}</div>
                  </div>
                  <Avatar member={member} size="sm" />
                </div>
              );
            }) : <EmptyState>마감 예정 업무가 없습니다.</EmptyState>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div onClick={() => onCardClick("workload")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">팀원별 업무량</div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {isSummaryPending ? (
              <EmptyState>데이터를 불러오는 중입니다</EmptyState>
            ) : workload.length ? workload.map((entry, index) => {
              const member = resolveMemberDisplay(entry.assigneeName, index, entry.assigneeId);
              const pct = entry.total === 0 ? 0 : Math.round((entry.done / entry.total) * 100);
              return (
                <div key={entry.assigneeId}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{member.name}</span>
                    <span className="text-muted-foreground">{entry.done}/{entry.total}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: member.color }} />
                  </div>
                </div>
              );
            }) : <EmptyState>팀원별 업무 데이터가 없습니다.</EmptyState>}
          </div>
        </div>

        <div onClick={() => onCardClick("activity")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">최근 활동</div>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {isSummaryPending ? (
              <EmptyState>데이터를 불러오는 중입니다</EmptyState>
            ) : recentActivity.length ? recentActivity.slice(0, 5).map(entry => (
              <div key={entry.id} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(112,72,232,0.12)" }}>
                  <Sparkles className="w-3 h-3" style={{ color: "#7048E8" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground font-medium truncate">{activityMessage(entry)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {activityTypeLabel(entry.type)} · {entry.actorName ?? "알 수 없음"} · {formatRelativeTime(entry.createdAt)}
                  </div>
                </div>
              </div>
            )) : <EmptyState>최근 활동이 없습니다.</EmptyState>}
          </div>
        </div>
      </div>
    </div>
  );
}
