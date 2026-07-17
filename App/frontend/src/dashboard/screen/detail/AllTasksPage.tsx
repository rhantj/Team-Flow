import { useState } from "react";
import { useNavigate } from "react-router";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { AIBox } from "../../../ai/components/AIBox";
import { TaskStatusPill } from "../../../board/components/TaskStatusPill";
import { PriorityBadge } from "../../../board/components/PriorityBadge";
import { SourceBadge } from "../../../github/components/SourceBadge";
import { TASK_SOURCES } from "../../../board/libs/mock/tasks";
import { useStoredTasks } from "../../../global/hooks/useStoredTasks";
import { formatDueDate } from "../../../board/libs/utils/taskService";
import { MEMBERS } from "../../../global/lib/mock/members";
import type { TaskStatus } from "../../../board/libs/types/task";
import {
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Check,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

export function AllTasksPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const TASKS = useStoredTasks();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [sortBy, setSortBy] = useState("마감일");
  const [selected, setSelected] = useState<string[]>([]);

  const statusMap: Record<string, TaskStatus | null> = {
    "전체": null, "대기": "todo", "진행 중": "inprogress", "완료": "done", "블로커": "blocked",
  };
  const filtered = TASKS.filter(t => {
    const ms = filterStatus === "전체" || t.status === statusMap[filterStatus];
    const mq = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search);
    return ms && mq;
  });

  const counts = {
    total: TASKS.length,
    done: TASKS.filter(t => t.status === "done").length,
    inProgress: TASKS.filter(t => t.status === "inprogress").length,
    blocked: TASKS.filter(t => t.status === "blocked").length,
  };

  const toggleAll = () => setSelected(filtered.every(t => selected.includes(t.id)) ? [] : filtered.map(t => t.id));
  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">전체 업무 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">프로젝트의 모든 To-Do를 확인하고 팀원에게 배정·관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 일괄 상태 변경
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "var(--primary)" }}>
            <Plus className="w-3.5 h-3.5" /> 업무 추가
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 업무" value={counts.total} sub="프로젝트 전체" color="#3B5BDB" icon={Layers} />
        <DetailStatCard label="완료" value={counts.done} sub={`완료율 ${Math.round(counts.done / counts.total * 100)}%`} color="#10B981" icon={CheckCircle2} />
        <DetailStatCard label="진행 중" value={counts.inProgress} sub="활성 업무" color="#3B5BDB" icon={Clock} />
        <DetailStatCard label="블로커" value={counts.blocked} sub="즉시 해결 필요" color="#EF4444" icon={AlertTriangle} />
      </div>

      {/* AI box */}
      <AIBox
        text="회의록 AI가 생성한 업무 5개 중 2개가 팀장 승인 대기 중입니다. 최동혁님 담당 업무 완료율이 37.5%로 가장 낮습니다. 업무 재배정을 검토하세요."
        onAsk={() => {}}
      />

      {/* filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="업무명·ID 검색..."
            className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-52" />
        </div>
        <div className="flex items-center gap-1">
          {["전체","대기","진행 중","완료","블로커"].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus === f ? "bg-blue-600 text-white" : "bg-card border border-border text-muted-foreground hover:border-slate-300"}`}>
              {f}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="ml-auto text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none cursor-pointer">
          <option>마감일</option><option>우선순위</option><option>상태</option><option>담당자</option>
        </select>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-600">
            {selected.length}개 선택 ·
            <button className="underline hover:no-underline">상태 변경</button>·
            <button className="underline hover:no-underline">담당자 변경</button>
          </div>
        )}
      </div>

      {/* pending approval banner */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-xs text-amber-700 flex-1">회의록 AI가 생성한 업무 2개가 승인 대기 중입니다.</span>
        <button className="text-xs font-semibold text-amber-700 underline hover:no-underline">승인 검토</button>
        <button className="text-xs font-medium text-amber-500">반려</button>
      </div>

      {/* table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="pl-4 pr-2 py-3">
                <div onClick={toggleAll}
                  className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${filtered.every(t => selected.includes(t.id)) && filtered.length > 0 ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                  {filtered.every(t => selected.includes(t.id)) && filtered.length > 0 && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
              </th>
              {["ID","업무명","담당자","상태","우선순위","마감일","출처","액션"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(task => {
              const member = MEMBERS.find(m => m.id === task.assignee)!;
              const src = TASK_SOURCES[task.id] ?? "직접 생성";
              const isSelected = selected.includes(task.id);
              // "12.18"이던 예전 임계값을 동일 시점의 ISO 날짜로 옮긴 것 - 동작은 그대로, 비교 방식만 ISO 문자열 비교로 변경.
              const isDueSoon = task.status !== "done" && task.dueDate !== "" && task.dueDate <= "2025-12-18";
              return (
                <tr key={task.id} className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}>
                  <td className="pl-4 pr-2 py-3">
                    <div onClick={() => toggle(task.id)}
                      className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${isSelected ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{task.id}</td>
                  <td className="px-3 py-3 max-w-[200px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground truncate">{task.title}</span>
                      {src === "회의록 AI" && <span className="text-[9px] text-purple-500">AI 생성 · 승인 대기</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: member.color }}>
                        {member.initials}
                      </div>
                      <span className="text-xs text-foreground whitespace-nowrap">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><TaskStatusPill status={task.status} /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={task.priority} /></td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-medium ${isDueSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                      {isDueSoon && "⚠ "}{formatDueDate(task.dueDate)}
                    </span>
                  </td>
                  <td className="px-3 py-3"><SourceBadge source={src} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700">상세</button>
                      <span className="text-border">·</span>
                      <button className="text-[11px] font-medium text-slate-500 hover:text-foreground">상태 변경</button>
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
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length}개 업무</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button className="px-2 py-1 rounded hover:bg-muted">이전</button>
            <span className="px-2 font-medium text-foreground">1 / 1</span>
            <button className="px-2 py-1 rounded hover:bg-muted">다음</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── page 2: progress analysis ────────────────────────────────────────────────
