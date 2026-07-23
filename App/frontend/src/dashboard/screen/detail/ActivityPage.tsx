import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FileAudio, FileText, GitCommit, GitMerge, GitPullRequest, MessageSquare, Package, Plus, RefreshCw, Search, Sparkles, TrendingUp, Zap } from "lucide-react";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { useAuth } from "../../../global/hooks/useAuth";
import { useDashboardActivities } from "../../libs/hooks/useDashboardActivities";
import {
  activityMessage,
  activityTypeLabel,
  formatRelativeTime,
  normalizeActivityType,
  type DashboardActivityType,
} from "../../libs/utils/activityDisplay";
import { resolveMemberDisplay } from "../../libs/utils/memberDisplay";

const TYPE_FILTERS = ["전체", "업무", "GitHub", "회의록", "AI", "산출물", "댓글"] as const;

const ACTIVITY_ICONS: Record<DashboardActivityType, { icon: any; color: string; bg: string }> = {
  commit: { icon: GitCommit, color: "#6B7280", bg: "#F4F6FA" },
  pr: { icon: GitPullRequest, color: "#3B5BDB", bg: "#EEF1FB" },
  merge: { icon: GitMerge, color: "#10B981", bg: "#ECFDF5" },
  task_create: { icon: Plus, color: "#7048E8", bg: "rgba(112,72,232,0.1)" },
  task_update: { icon: RefreshCw, color: "#3B5BDB", bg: "#EEF1FB" },
  meeting: { icon: FileAudio, color: "#7048E8", bg: "rgba(112,72,232,0.1)" },
  ai: { icon: Sparkles, color: "#7048E8", bg: "rgba(112,72,232,0.15)" },
  deliverable: { icon: Package, color: "#10B981", bg: "#ECFDF5" },
  comment: { icon: MessageSquare, color: "#8892A4", bg: "#F4F6FA" },
  file: { icon: FileText, color: "#F59E0B", bg: "#FFFBEB" },
};

function matchesTypeFilter(type: string, filter: string) {
  if (filter === "전체") return true;
  const normalized = normalizeActivityType(type);
  if (filter === "업무") return normalized === "task_create" || normalized === "task_update";
  if (filter === "GitHub") return normalized === "commit" || normalized === "pr" || normalized === "merge";
  if (filter === "회의록") return normalized === "meeting";
  if (filter === "AI") return normalized === "ai";
  if (filter === "산출물") return normalized === "deliverable" || normalized === "file";
  if (filter === "댓글") return normalized === "comment";
  return true;
}

function isToday(iso: string | null | undefined) {
  if (!iso) return false;
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function withinDays(iso: string | null | undefined, days: number) {
  if (!iso) return false;
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return false;
  return Date.now() - date <= days * 86400000;
}

export function ActivityPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const { currentProjectId } = useAuth();
  const { data: activities, loading, error, refetch } = useDashboardActivities(currentProjectId);
  const [typeFilter, setTypeFilter] = useState("전체");
  const [memberFilter, setMemberFilter] = useState("전체");
  const [search, setSearch] = useState("");

  const memberOptions = useMemo(
    () => Array.from(new Set(activities.map(item => item.actorName).filter(Boolean))) as string[],
    [activities]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activities.filter(activity => {
      const matchesType = matchesTypeFilter(activity.type, typeFilter);
      const matchesMember = memberFilter === "전체" || activity.actorName === memberFilter;
      const matchesSearch = !query || activityMessage(activity).toLowerCase().includes(query);
      return matchesType && matchesMember && matchesSearch;
    });
  }, [activities, memberFilter, search, typeFilter]);

  const todayCount = activities.filter(a => isToday(a.createdAt)).length;
  const weekCount = activities.filter(a => withinDays(a.createdAt, 7)).length;
  const taskCount = activities.filter(a => matchesTypeFilter(a.type, "업무")).length;
  const aiCount = activities.filter(a => normalizeActivityType(a.type) === "ai").length;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">최근 활동</h1>
          <p className="text-sm text-muted-foreground mt-0.5">팀 전체 활동을 타임라인으로 확인하고 중요 변경사항을 파악합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          <button onClick={() => navigate("/dashboard/dash-progress")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
            <Sparkles className="w-3.5 h-3.5" /> AI 분석 보기
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="오늘 활동" value={loading ? "..." : todayCount} sub="오늘 기준" color="#3B5BDB" icon={Zap} />
        <DetailStatCard label="이번 주 전체" value={loading ? "..." : weekCount} sub="최근 7일 기준" color="#7048E8" icon={TrendingUp} />
        <DetailStatCard label="업무 활동" value={loading ? "..." : taskCount} sub="생성/변경" color="#10B981" icon={RefreshCw} />
        <DetailStatCard label="AI 생성" value={loading ? "..." : aiCount} sub="자동 생성 항목" color="#7048E8" icon={Sparkles} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_FILTERS.map(filter => (
          <button key={filter} onClick={() => setTypeFilter(filter)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${typeFilter === filter ? "bg-blue-600 text-white border-blue-600" : "bg-card border-border text-muted-foreground hover:border-slate-300"}`}>
            {filter}
          </button>
        ))}
        <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="ml-2 text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none">
          <option>전체</option>
          {memberOptions.map(name => <option key={name}>{name}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="활동 검색" className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 w-44" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-1">
          {filtered.map((activity, index) => {
            const normalized = normalizeActivityType(activity.type);
            const meta = ACTIVITY_ICONS[normalized];
            const IconComp = meta.icon;
            const actor = resolveMemberDisplay(activity.actorName, index);
            const isLast = index === filtered.length - 1;
            return (
              <div key={activity.id} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                    <IconComp className="w-3.5 h-3.5" style={{ color: meta.color }} />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 bg-border my-1" />}
                </div>
                <div className="flex-1 bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow cursor-pointer mb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: meta.bg, color: meta.color }}>{activityTypeLabel(activity.type)}</span>
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: actor.color }}>{actor.initials}</div>
                          <span className="text-[10px] font-medium text-foreground">{actor.name}</span>
                        </div>
                      </div>
                      <div className="text-xs text-foreground leading-relaxed">{activityMessage(activity)}</div>
                      {activity.targetId && <div className="mt-1"><span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{activity.targetId}</span></div>}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{formatRelativeTime(activity.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {(loading || filtered.length === 0) && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              {loading ? "데이터를 불러오는 중입니다" : "표시할 활동이 없습니다."}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border" style={{ background: "rgba(112,72,232,0.05)" }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3 h-3 text-white" /></div>
              <span className="text-sm font-semibold text-foreground">AI 주간 활동 요약</span>
            </div>
            <div className="p-4 space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
                <div className="font-semibold mb-1">핵심 요약</div>
                미구현된 기능입니다.
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                <div className="font-semibold mb-1">주요 변경사항</div>
                미구현된 기능입니다.
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                <div className="font-semibold mb-1">권장 액션</div>
                미구현된 기능입니다.
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="text-sm font-semibold text-foreground mb-3">팀원별 활동량</div>
            {memberOptions.map((name, index) => {
              const member = resolveMemberDisplay(name, index);
              const count = activities.filter(activity => activity.actorName === name).length;
              const maxCount = Math.max(...memberOptions.map(memberName => activities.filter(activity => activity.actorName === memberName).length), 1);
              return (
                <div key={name} className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: member.color }}>{member.initials}</div>
                  <div className="flex-1 h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: member.color }} /></div>
                  <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                </div>
              );
            })}
            {(loading || memberOptions.length === 0) && (
              <div className="text-xs text-muted-foreground">
                {loading ? "데이터를 불러오는 중입니다" : "활동 기록이 없습니다."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
