import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Check, CheckCircle2, Clock, Layers, MessageSquare, Plus, RefreshCw, Search } from "lucide-react";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { PriorityBadge } from "../../../board/components/PriorityBadge";
import { TaskStatusPill } from "../../../board/components/TaskStatusPill";
import { useAuth } from "../../../global/hooks/useAuth";
import { useDashboardTasks } from "../../libs/hooks/useDashboardTasks";
import {
  daysUntilDue,
  formatDashboardDueDate,
  normalizePriority,
  normalizeTaskStatus,
  sourceLabel,
  taskAssignee,
  taskSearchText,
} from "../../libs/utils/dashboardTaskUtils";
import type { TaskStatus } from "../../../board/libs/types/task";

const STATUS_FILTERS: Array<{ label: string; value: TaskStatus | "all" }> = [
  { label: "전체", value: "all" },
  { label: "대기", value: "todo" },
  { label: "진행 중", value: "inprogress" },
  { label: "완료", value: "done" },
  { label: "블로커", value: "blocked" },
];

export function AllTasksPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const { currentProjectId } = useAuth();
  const { data: tasks, loading, error, refetch } = useDashboardTasks(currentProjectId);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [sortBy, setSortBy] = useState("dueDate");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = tasks.filter(task => {
      const matchesStatus = filterStatus === "all" || normalizeTaskStatus(task.status) === filterStatus;
      const matchesQuery = !query || taskSearchText(task).includes(query);
      return matchesStatus && matchesQuery;
    });
    return [...rows].sort((a, b) => {
      if (sortBy === "status") return normalizeTaskStatus(a.status).localeCompare(normalizeTaskStatus(b.status));
      if (sortBy === "assignee") return (a.assigneeName ?? "").localeCompare(b.assigneeName ?? "");
      return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
    });
  }, [filterStatus, search, sortBy, tasks]);

  const counts = {
    total: tasks.length,
    done: tasks.filter(t => normalizeTaskStatus(t.status) === "done").length,
    inProgress: tasks.filter(t => normalizeTaskStatus(t.status) === "inprogress").length,
    blocked: tasks.filter(t => normalizeTaskStatus(t.status) === "blocked").length,
  };

  const donePct = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);
  const allSelected = filtered.length > 0 && filtered.every(t => selected.includes(t.id));
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map(t => t.id));
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">전체 업무 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Supabase에 저장된 프로젝트 업무를 조회합니다.</p>
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
        <DetailStatCard label="전체 업무" value={loading ? "..." : counts.total} sub="프로젝트 전체" color="#3B5BDB" icon={Layers} />
        <DetailStatCard label="완료" value={loading ? "..." : counts.done} sub={loading ? "불러오는 중" : `완료율 ${donePct}%`} color="#10B981" icon={CheckCircle2} />
        <DetailStatCard label="진행 중" value={loading ? "..." : counts.inProgress} sub="활성 업무" color="#3B5BDB" icon={Clock} />
        <DetailStatCard label="블로커" value={loading ? "..." : counts.blocked} sub="해결 필요" color="#EF4444" icon={AlertTriangle} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="업무명, 담당자 검색"
            className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-56" />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(filter => (
            <button key={filter.value} onClick={() => setFilterStatus(filter.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus === filter.value ? "bg-blue-600 text-white" : "bg-card border border-border text-muted-foreground hover:border-slate-300"}`}>
              {filter.label}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="ml-auto text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none cursor-pointer">
          <option value="dueDate">마감일순</option>
          <option value="status">상태순</option>
          <option value="assignee">담당자순</option>
        </select>
        {selected.length > 0 && (
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-600">
            {selected.length}개 선택됨
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="pl-4 pr-2 py-3">
                <button onClick={toggleAll} className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                  {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
                </button>
              </th>
              {["ID", "업무명", "담당자", "상태", "우선순위", "마감일", "출처", "액션"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((task, index) => {
              const member = taskAssignee(task, index);
              const status = normalizeTaskStatus(task.status);
              const priority = normalizePriority(task.priority);
              const isSelected = selected.includes(task.id);
              const daysLeft = daysUntilDue(task.dueDate);
              const isDueSoon = status !== "done" && daysLeft != null && daysLeft <= 3;
              return (
                <tr key={task.id} className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}>
                  <td className="pl-4 pr-2 py-3">
                    <button onClick={() => toggle(task.id)} className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{task.id}</td>
                  <td className="px-3 py-3 max-w-[240px]">
                    <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                    {task.description && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{task.description}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: member.color }}>{member.initials}</div>
                      <span className="text-xs text-foreground whitespace-nowrap">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><TaskStatusPill status={status} /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={priority} /></td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-medium ${isDueSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                      {formatDashboardDueDate(task.dueDate)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">{sourceLabel(task.sourceType)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button onClick={() => navigate("/board")} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">보드에서 보기</button>
                      <button className="p-1 rounded hover:bg-muted transition-colors">
                        <MessageSquare className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(loading || filtered.length === 0) && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {loading ? "데이터를 불러오는 중입니다" : "표시할 업무가 없습니다."}
          </div>
        )}
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length}개 업무</span>
          <span className="text-xs text-muted-foreground">Supabase 실시간 조회 결과</span>
        </div>
      </div>
    </div>
  );
}
