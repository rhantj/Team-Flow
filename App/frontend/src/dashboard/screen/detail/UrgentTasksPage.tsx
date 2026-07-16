import { useState } from "react";
import { useNavigate } from "react-router";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { TaskStatusPill } from "../../../board/components/TaskStatusPill";
import { PriorityBadge } from "../../../board/components/PriorityBadge";
import { URGENT_META } from "../../../board/libs/mock/tasks";
import { useStoredTasks } from "../../../global/hooks/useStoredTasks";
import { formatDueDate } from "../../../board/libs/utils/taskService";
import { MEMBERS } from "../../../global/lib/mock/members";
import {
  Sparkles,
  Bell,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

export function UrgentTasksPage() {
  const TASKS = useStoredTasks();
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const [selected, setSelected] = useState<string | null>("TF-13");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");

  const urgentTasks = TASKS.filter(t => t.status !== "done").filter(t => {
    const mq = !search || t.title.toLowerCase().includes(search.toLowerCase());
    const ma = assigneeFilter === "전체" || MEMBERS.find(m => m.id === t.assignee)?.name === assigneeFilter;
    return mq && ma;
  });

  const groups = [
    { label: "🔴 오늘 마감", urgency: "today",  color: "#EF4444", bg: "bg-red-50 border-red-200" },
    { label: "🟠 3일 이내",  urgency: "3day",   color: "#F97316", bg: "bg-orange-50 border-orange-200" },
    { label: "🟡 7일 이내",  urgency: "week",   color: "#F59E0B", bg: "bg-amber-50 border-amber-200" },
    { label: "⚫ 이미 지연", urgency: "overdue", color: "#6B7280", bg: "bg-slate-50 border-slate-200" },
  ];

  const selectedTask = TASKS.find(t => t.id === selected);
  const selectedMeta = selected ? URGENT_META[selected] : null;
  const selectedMember = selectedTask ? MEMBERS.find(m => m.id === selectedTask.assignee)! : null;

  const urgencyCount = (u: string) => urgentTasks.filter(t => URGENT_META[t.id]?.urgency === u).length;

  return (
    <div className="h-full overflow-hidden flex flex-col p-6 gap-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between shrink-0">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">마감 임박 업무</h1><p className="text-sm text-muted-foreground mt-0.5">마감이 가까운 업무와 지연된 업무를 우선순위별로 관리합니다.</p></div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><Bell className="w-3.5 h-3.5" />일괄 리마인드</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3.5 h-3.5" />AI 마감 위험 분석</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 shrink-0">
        <DetailStatCard label="오늘 마감" value={urgencyCount("today")} sub="즉시 확인 필요" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="3일 이내" value={urgencyCount("3day")} sub="긴급 처리 필요" color="#F97316" icon={AlertTriangle} />
        <DetailStatCard label="7일 이내" value={urgencyCount("week")} sub="이번 주 완료 목표" color="#F59E0B" icon={Clock} />
        <DetailStatCard label="이미 지연" value={urgencyCount("overdue")} sub="즉시 담당자 확인" color="#6B7280" icon={AlertTriangle} />
      </div>

      <AIBox text="TF-13(DB 인덱싱)과 TF-14(결제 오류 처리)가 블로커 상태로 D-5, D-6 마감을 앞두고 있습니다. 오늘 내 팀 전체 긴급 회의를 소집하거나 해결 담당자를 즉시 지정하세요." onAsk={() => {}} />

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="업무명 검색..." className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-48" />
        </div>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none">
          <option>전체</option>{MEMBERS.map(m => <option key={m.id}>{m.name}</option>)}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">{urgentTasks.length}개 업무</div>
      </div>

      <div className="flex-1 overflow-hidden flex gap-4 min-h-0">
        {/* Task list */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {groups.map(g => {
            const tasks = urgentTasks.filter(t => URGENT_META[t.id]?.urgency === g.urgency);
            if (!tasks.length) return null;
            return (
              <div key={g.urgency}>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold mb-2 ${g.bg}`} style={{ color: g.color }}>{g.label} ({tasks.length})</div>
                <div className="space-y-2">
                  {tasks.map(task => {
                    const member = MEMBERS.find(m => m.id === task.assignee)!;
                    const meta = URGENT_META[task.id];
                    const isSelected = selected === task.id;
                    return (
                      <div key={task.id} onClick={() => setSelected(task.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? "border-blue-400 bg-blue-50/50" : "bg-card border-border hover:border-slate-300 hover:shadow-sm"}`}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: member.color }}>{member.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{task.id}</span>
                            <TaskStatusPill status={task.status} />
                            <PriorityBadge priority={task.priority} />
                            {task.status === "blocked" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">블로커</span>}
                          </div>
                          <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{member.name} · 마감 {formatDueDate(task.dueDate)}</div>
                        </div>
                        <div className="shrink-0 text-center">
                          <div className="text-lg font-bold" style={{ color: g.color }}>D-{meta?.daysLeft}</div>
                          <div className="text-[9px] text-muted-foreground">남은 일수</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selectedTask && selectedMember && (
          <div className="w-72 shrink-0 bg-card border border-border rounded-xl overflow-y-auto">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] text-muted-foreground">{selectedTask.id}</span>
                <TaskStatusPill status={selectedTask.status} />
              </div>
              <div className="text-sm font-semibold text-foreground leading-snug">{selectedTask.title}</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[10px] text-muted-foreground mb-1">담당자</div>
                  <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: selectedMember.color }}>{selectedMember.initials}</div><span className="font-medium text-foreground">{selectedMember.name}</span></div>
                </div>
                <div><div className="text-[10px] text-muted-foreground mb-1">우선순위</div><PriorityBadge priority={selectedTask.priority} /></div>
                <div><div className="text-[10px] text-muted-foreground mb-1">마감일</div><span className="font-semibold text-foreground">{formatDueDate(selectedTask.dueDate)}</span></div>
                <div><div className="text-[10px] text-muted-foreground mb-1">남은 시간</div><span className="font-bold" style={{ color: selectedMeta && selectedMeta.daysLeft <= 3 ? "#EF4444" : "#F59E0B" }}>D-{selectedMeta?.daysLeft}</span></div>
              </div>
              <div className="flex flex-wrap gap-1">{selectedTask.labels.map(l => <LabelBadge key={l} label={l} />)}</div>
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">빠른 액션</div>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"><Bell className="w-3.5 h-3.5" />리마인드 알림 보내기</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><User className="w-3.5 h-3.5" />담당자 변경</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><Calendar className="w-3.5 h-3.5" />마감일 수정</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />완료 처리</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />블로커로 지정</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><MessageSquare className="w-3.5 h-3.5" />코멘트 작성</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── page 7: workload ─────────────────────────────────────────────────────────
