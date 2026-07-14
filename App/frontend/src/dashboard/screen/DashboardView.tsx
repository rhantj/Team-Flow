import { useNavigate } from "react-router";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { Sparkles, Layers, TrendingUp, AlertTriangle, Clock, Calendar, BarChart3, Zap, GitPullRequest, GitCommit, GitMerge, Plus, Upload, Package, Github, Columns3, Users } from "lucide-react";
import { StatCard } from "../../global/component/StatCard";
import { Avatar } from "../../global/component/Avatar";
import { StatusIcon } from "../../global/component/StatusIcon";
import { useStoredTasks } from "../../global/hooks/useStoredTasks";
import { useStoredActivity } from "../../board/libs/utils/activityStore";
import { MEMBERS } from "../../global/lib/mock/members";
import { GITHUB } from "../../github/libs/mock/github";
import { WORKLOAD_DATA, PROGRESS_HISTORY } from "../libs/mock/workload";
import { getDoneCount, getProgressPercent, getBlockedCount, getInProgressCount } from "../../board/libs/utils/taskService";
import type { DetailPage } from "../../board/libs/types/task";
import { useState } from "react";

const OPEN_AI_ASSISTANT_EVENT = "workflow-ai:open-ai-assistant";

const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};

export function DashboardView() {
  const navigate = useNavigate();
  const onCardClick = (p: DetailPage) => navigate(`/dashboard/${p}`);
  const TASKS = useStoredTasks();
  const recentActivity = useStoredActivity();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const totalTasks = TASKS.length;
  const doneTasks = getDoneCount(TASKS);
  const progressPct = getProgressPercent(TASKS);
  const atRisk = getBlockedCount(TASKS);
  const inProgress = getInProgressCount(TASKS);

  const QUICK_ACTIONS = [
    { label: "새 업무 추가", icon: Plus, color: "#3B5BDB", onClick: () => navigate("/board?openAdd=1") },
    { label: "회의록 업로드", icon: Upload, color: "#7048E8", onClick: () => navigate("/meetings?upload=1") },
    { label: "산출물 생성", icon: Package, color: "#0F766E", onClick: () => navigate("/deliverables") },
    { label: "GitHub 연동", icon: Github, color: "#374151", onClick: () => navigate("/github") },
    { label: "AI 어시스턴트 열기", icon: Sparkles, color: "#F59E0B", onClick: () => window.dispatchEvent(new Event(OPEN_AI_ASSISTANT_EVENT)) },
    { label: "업무 보드 이동", icon: Columns3, color: "#0EA5E9", onClick: () => navigate("/board") },
    { label: "미배정 업무 보기", icon: Users, color: "#EC4899", onClick: () => navigate("/dashboard/all-tasks") },
    { label: "마감 임박 업무 보기", icon: Clock, color: "#EF4444", onClick: () => navigate("/dashboard/urgent") },
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {toast && (
        <div className="fixed top-4 right-6 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-lg" style={{ background: "#1C2333" }}>
          {toast}
        </div>
      )}

      {/* AI Recommendation Banner */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <Sparkles className="w-5 h-5 text-white shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">AI 추천 액션</div>
          <div className="text-xs text-purple-100 mt-0.5">최동혁님의 결제 연동 작업이 3일 지연 위험입니다. 오늘 중 코드 리뷰를 진행하고 블로커를 해소하는 것을 추천합니다.</div>
        </div>
        <button onClick={() => showToast("준비 중인 기능입니다.")} className="text-xs font-medium text-white bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors shrink-0">
          자세히
        </button>
      </div>

      {/* Quick actions */}
      <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
        <div className="text-sm font-semibold text-foreground mb-3">빠른 액션</div>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button key={action.label} onClick={action.onClick}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card hover:shadow-sm hover:border-slate-300 transition-all text-left">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${action.color}18` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: action.color }} />
                </div>
                <span className="text-xs font-medium text-foreground leading-tight">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Layers} label="전체 업무" value={totalTasks} sub={`완료 ${doneTasks}개`} color="#3B5BDB" onClick={() => onCardClick("all-tasks")} />
        <StatCard icon={TrendingUp} label="완료율" value={`${progressPct}%`} sub="목표 100% (12.30)" color="#10B981" onClick={() => onCardClick("progress")} />
        <StatCard icon={AlertTriangle} label="블로커" value={atRisk} sub="즉시 해결 필요" color="#EF4444" onClick={() => onCardClick("blockers")} />
        <StatCard icon={Clock} label="진행 중" value={inProgress} sub="D-18 마감" color="#F59E0B" onClick={() => onCardClick("inprogress")} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Progress card */}
        <div onClick={() => onCardClick("dash-progress")} className="col-span-2 bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-foreground">전체 진행률</div>
              <div className="text-xs text-muted-foreground mt-0.5">마감까지 18일 남음</div>
            </div>
            <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{progressPct}%</div>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-1">
            <div className="h-2 rounded-full transition-all" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #3B5BDB, #7048E8)" }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span><span>목표 100%</span>
          </div>

          <div className="mt-5 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PROGRESS_HISTORY} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <defs>
                  <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop key="s1" offset="5%" stopColor="#3B5BDB" stopOpacity={0.18} />
                    <stop key="s2" offset="95%" stopColor="#3B5BDB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid key="acg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="ax" dataKey="week" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="ay" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="att" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Area key="area-progress" type="monotone" dataKey="progress" stroke="#3B5BDB" strokeWidth={2} fill="url(#progGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deadline list */}
        <div onClick={() => onCardClick("urgent")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">마감 임박 업무</div>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {TASKS.filter(t => t.status !== "done").slice(0, 5).map(task => {
              const m = MEMBERS.find(m => m.id === task.assignee)!;
              return (
                <div key={task.id} className="flex items-center gap-2.5">
                  <StatusIcon status={task.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                    <div className="text-[10px] text-muted-foreground">마감 {task.dueDate}</div>
                  </div>
                  <Avatar member={m} size="sm" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team workload + Activity */}
      <div className="grid grid-cols-2 gap-4">
        {/* Team workload */}
        <div onClick={() => onCardClick("workload")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">팀원별 업무량</div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {WORKLOAD_DATA.map(m => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">{m.name}</span>
                  <span className="text-muted-foreground">{m.done}/{m.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${(m.done / m.total) * 100}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WORKLOAD_DATA} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <CartesianGrid key="bcg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="bx" dataKey="name" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="by" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="btt" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Bar key="bar-total" dataKey="total" fill="#EEF1FB" radius={[3, 3, 0, 0]} />
                <Bar key="bar-done" dataKey="done" fill="#3B5BDB" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent activity */}
        <div onClick={() => onCardClick("activity")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">최근 활동</div>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {recentActivity.slice(0, 3).map(entry => (
              <div key={entry.id} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(112,72,232,0.12)" }}>
                  <Sparkles className="w-3 h-3" style={{ color: "#7048E8" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground font-medium truncate">{entry.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{entry.actorName} · {formatRelativeTime(entry.createdAt)}</div>
                </div>
              </div>
            ))}
            {GITHUB.slice(0, Math.max(0, 5 - recentActivity.length)).map((g, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: g.type === "pr" ? "#EEF1FB" : g.type === "merge" ? "#ECFDF5" : "#F4F6FA" }}>
                  {g.type === "pr" && <GitPullRequest className="w-3 h-3" style={{ color: "#3B5BDB" }} />}
                  {g.type === "commit" && <GitCommit className="w-3 h-3 text-slate-500" />}
                  {g.type === "merge" && <GitMerge className="w-3 h-3 text-emerald-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground font-medium truncate">{g.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{g.author} · {g.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
