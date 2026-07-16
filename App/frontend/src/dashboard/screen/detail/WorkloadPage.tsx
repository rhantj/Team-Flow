import { useState } from "react";
import { useNavigate } from "react-router";
import { BackBtn } from "../../../global/component/BackBtn";
import { TaskStatusPill } from "../../../board/components/TaskStatusPill";
import { PriorityBadge } from "../../../board/components/PriorityBadge";
import { useStoredTasks } from "../../../global/hooks/useStoredTasks";
import { MEMBERS } from "../../../global/lib/mock/members";
import { WORKLOAD_DATA } from "../../libs/mock/workload";
import { formatDueDate } from "../../../board/libs/utils/taskService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FileAudio,
  Package,
  Sparkles,
  Plus,
  AlertTriangle,
  X,
  GitCommit,
  GitPullRequest,
  BarChart3,
  GitMerge,
  FileText,
  Layers,
  Users,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

export function WorkloadPage() {
  const TASKS = useStoredTasks();
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const memberTasks = (id: string) => ({
    total:    TASKS.filter(t => t.assignee === id).length,
    done:     TASKS.filter(t => t.assignee === id && t.status === "done").length,
    inprog:   TASKS.filter(t => t.assignee === id && t.status === "inprogress").length,
    blocked:  TASKS.filter(t => t.assignee === id && t.status === "blocked").length,
    todo:     TASKS.filter(t => t.assignee === id && t.status === "todo").length,
    list:     TASKS.filter(t => t.assignee === id),
  });

  const overallBalance = "보통";
  const aiRec = "최동혁님의 진행 중 업무가 4개로 가장 많고 블로커 2개가 포함되어 있습니다. TF-12(보안 점검 보고서)를 박지수님에게 재배정하는 것을 추천합니다.";

  const barData = MEMBERS.map(m => {
    const t = memberTasks(m.id);
    return { name: m.name, 완료: t.done, 진행중: t.inprog, 대기: t.todo, 블로커: t.blocked };
  });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">팀원별 업무량</h1><p className="text-sm text-muted-foreground mt-0.5">팀원별 업무 분배 현황을 파악하고 과부하 위험을 확인합니다.</p></div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><Plus className="w-3.5 h-3.5" />업무 배정</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3.5 h-3.5" />AI 균형 추천</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="팀원 수" value={`${MEMBERS.length}명`} sub="팀장 포함" color="#3B5BDB" icon={Users} />
        <DetailStatCard label="1인 평균 업무" value="3.5개" sub="진행 중 기준" color="#7048E8" icon={Layers} />
        <DetailStatCard label="과부하 위험" value="1명" sub="최동혁님" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="업무 균형" value={overallBalance} sub="재배정 검토 필요" color="#F59E0B" icon={BarChart3} />
      </div>

      {/* AI recommendation */}
      <AIBox text={aiRec} onAsk={() => {}} />

      <div className="grid grid-cols-3 gap-4">
        {/* Workload bar chart */}
        <div className="col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">팀원별 업무 현황 비교</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {[{ color: "#10B981", l: "완료" }, { color: "#3B5BDB", l: "진행중" }, { color: "#C1C9D9", l: "대기" }, { color: "#EF4444", l: "블로커" }].map(x => (
                <span key={x.l} className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ background: x.color }} />{x.l}</span>
              ))}
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid key="cg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="x" dataKey="name" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="y" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="tt" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Bar key="b1" dataKey="완료"  stackId="a" fill="#10B981" radius={[0,0,0,0]} />
                <Bar key="b2" dataKey="진행중" stackId="a" fill="#3B5BDB" radius={[0,0,0,0]} />
                <Bar key="b3" dataKey="대기"  stackId="a" fill="#C1C9D9" radius={[0,0,0,0]} />
                <Bar key="b4" dataKey="블로커" stackId="a" fill="#EF4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Progress comparison */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">완료율 비교</div>
          <div className="space-y-4">
            {MEMBERS.map(m => {
              const t = memberTasks(m.id);
              const pct = Math.round((t.done / t.total) * 100);
              const isOverload = t.blocked > 0 && t.inprog >= 2;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>{m.initials}</div>
                      <span className="font-medium text-foreground">{m.name}</span>
                      {isOverload && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600">과부하</span>}
                    </div>
                    <span className={`font-semibold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{t.done}/{t.total}개 · 블로커 {t.blocked}개</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Member cards */}
      <div className="grid grid-cols-2 gap-4">
        {MEMBERS.map(m => {
          const t = memberTasks(m.id);
          const pct = Math.round((t.done / t.total) * 100);
          const isSelected = selectedMember === m.id;
          const isOverload = t.blocked > 0 && t.inprog >= 2;
          return (
            <div key={m.id} onClick={() => setSelectedMember(isSelected ? null : m.id)}
              className={`bg-card rounded-xl p-5 border-2 cursor-pointer transition-all shadow-sm hover:shadow-md ${isSelected ? "border-blue-400" : isOverload ? "border-red-200" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: m.color }}>{m.initials}</div>
                  <div><div className="text-sm font-semibold text-foreground">{m.name}</div><div className="text-xs text-muted-foreground">{m.role}</div></div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isOverload && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">과부하 위험</span>}
                  <span className={`text-lg font-bold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[{ l: "전체", v: t.total, c: "#3B5BDB" }, { l: "완료", v: t.done, c: "#10B981" }, { l: "진행중", v: t.inprog, c: "#3B5BDB" }, { l: "블로커", v: t.blocked, c: "#EF4444" }].map(s => (
                  <div key={s.l} className="text-center p-1.5 rounded-lg bg-muted">
                    <div className="text-sm font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="text-[9px] text-muted-foreground">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: m.color }} /></div>
              {isSelected && (
                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <button className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">업무 재배정</button>
                  <button className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">업무 목록 보기</button>
                  <button className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">코멘트</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected member task list */}
      {selectedMember && (() => {
        const m = MEMBERS.find(mem => mem.id === selectedMember)!;
        const tasks = memberTasks(selectedMember).list;
        return (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: m.color }}>{m.initials}</div>
                <span className="text-sm font-semibold text-foreground">{m.name}님의 업무 목록</span>
              </div>
              <button onClick={() => setSelectedMember(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="divide-y divide-border">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                  <span className="font-mono text-[10px] text-muted-foreground w-12">{task.id}</span>
                  <span className="flex-1 text-xs font-medium text-foreground truncate">{task.title}</span>
                  <TaskStatusPill status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  <span className="text-xs text-muted-foreground w-10 text-right">{formatDueDate(task.dueDate)}</span>
                  <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">재배정</button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── page 8: activity ─────────────────────────────────────────────────────────
const ACTIVITY_ICONS: Record<ActivityType, { icon: any; color: string; bg: string; label: string }> = {
  commit:      { icon: GitCommit,      color: "#6B7280", bg: "#F4F6FA",    label: "커밋" },
  pr:          { icon: GitPullRequest, color: "#3B5BDB", bg: "#EEF1FB",   label: "PR" },
  merge:       { icon: GitMerge,       color: "#10B981", bg: "#ECFDF5",   label: "머지" },
  task_create: { icon: Plus,           color: "#7048E8", bg: "rgba(112,72,232,0.1)", label: "업무 생성" },
  task_update: { icon: RefreshCw,      color: "#3B5BDB", bg: "#EEF1FB",   label: "상태 변경" },
  meeting:     { icon: FileAudio,      color: "#7048E8", bg: "rgba(112,72,232,0.1)", label: "회의록" },
  ai:          { icon: Sparkles,       color: "#7048E8", bg: "rgba(112,72,232,0.15)", label: "AI" },
  deliverable: { icon: Package,        color: "#10B981", bg: "#ECFDF5",   label: "산출물" },
  comment:     { icon: MessageSquare,  color: "#8892A4", bg: "#F4F6FA",   label: "댓글" },
  file:        { icon: FileText,       color: "#F59E0B", bg: "#FFFBEB",   label: "파일" },
};

