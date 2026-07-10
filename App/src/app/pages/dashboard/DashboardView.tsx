import { useNavigate } from "react-router";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { Sparkles, Layers, TrendingUp, AlertTriangle, Clock, Calendar, BarChart3, Zap, GitPullRequest, GitCommit, GitMerge } from "lucide-react";
import { StatCard } from "../../components/common/StatCard";
import { Avatar } from "../../components/common/Avatar";
import { StatusIcon } from "../../components/common/StatusIcon";
import { TASKS } from "../../data/tasks";
import { MEMBERS } from "../../data/members";
import { GITHUB } from "../../data/github";
import { WORKLOAD_DATA, PROGRESS_HISTORY } from "../../data/workload";
import { getDoneCount, getProgressPercent, getBlockedCount, getInProgressCount } from "../../services/taskService";
import type { DetailPage } from "../../models/task";

export function DashboardView() {
  const navigate = useNavigate();
  const onCardClick = (p: DetailPage) => navigate(`/dashboard/${p}`);

  const totalTasks = TASKS.length;
  const doneTasks = getDoneCount(TASKS);
  const progressPct = getProgressPercent(TASKS);
  const atRisk = getBlockedCount(TASKS);
  const inProgress = getInProgressCount(TASKS);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {/* AI Recommendation Banner */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <Sparkles className="w-5 h-5 text-white shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">AI 추천 액션</div>
          <div className="text-xs text-purple-100 mt-0.5">최동혁님의 결제 연동 작업이 3일 지연 위험입니다. 오늘 중 코드 리뷰를 진행하고 블로커를 해소하는 것을 추천합니다.</div>
        </div>
        <button className="text-xs font-medium text-white bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors shrink-0">
          자세히
        </button>
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
            {GITHUB.slice(0, 5).map((g, i) => (
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
