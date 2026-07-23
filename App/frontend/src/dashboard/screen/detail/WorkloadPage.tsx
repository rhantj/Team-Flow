import { useState } from "react";
import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Layers, Plus, RefreshCw, Sparkles, Users, X } from "lucide-react";
import { AIBox } from "../../../ai/components/AIBox";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { PriorityBadge } from "../../../board/components/PriorityBadge";
import { TaskStatusPill } from "../../../board/components/TaskStatusPill";
import { useAuth } from "../../../global/hooks/useAuth";
import { useDashboardSummary } from "../../libs/hooks/useDashboardSummary";
import { useDashboardTasks } from "../../libs/hooks/useDashboardTasks";
import {
  formatDashboardDueDate,
  normalizePriority,
  normalizeTaskStatus,
} from "../../libs/utils/dashboardTaskUtils";
import { resolveMemberDisplay } from "../../libs/utils/memberDisplay";

export function WorkloadPage() {
  const { currentProjectId } = useAuth();
  const { data: summary, loading: summaryLoading, error: summaryError } = useDashboardSummary(currentProjectId);
  const { data: tasks, loading: tasksLoading, error: tasksError, refetch } = useDashboardTasks(currentProjectId);
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const workload = summary?.workload ?? [];
  const memberCount = workload.length;
  const assignedTotal = workload.reduce((sum, member) => sum + member.total, 0);
  const averageTasks = memberCount === 0 ? 0 : Math.round((assignedTotal / memberCount) * 10) / 10;
  const assignedInProgressTotal = workload.reduce((sum, member) => sum + member.inProgress, 0);
  const averageInProgressTasks = memberCount === 0 ? 0 : Math.round((assignedInProgressTotal / memberCount) * 10) / 10;
  const maxWorkload = workload.reduce((max, member) => Math.max(max, member.total), 0);
  const overloaded = workload.filter(member => member.blocked > 0 || member.total >= Math.max(averageTasks * 1.5, averageTasks + 2));
  const balanceLabel = overloaded.length === 0 ? "양호" : "점검 필요";
  const barData = workload.map((entry, index) => ({
    id: entry.assigneeId,
    name: resolveMemberDisplay(entry.assigneeName, index, entry.assigneeId).name,
    완료: entry.done,
    진행중: entry.inProgress,
    대기: entry.todo,
    블로커: entry.blocked,
  }));

  const selectedTasks = selectedMember ? tasks.filter(task => task.assigneeId === selectedMember) : [];
  const error = summaryError ?? tasksError;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">팀원별 업무량</h1>
          <p className="text-sm text-muted-foreground mt-0.5">팀원별 업무 분배 현황을 파악하고 과부하 위험을 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><RefreshCw className="w-3.5 h-3.5" />새로고침</button>
          <button onClick={() => navigate("/board?openAdd=1")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Plus className="w-3.5 h-3.5" />업무 배정</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="팀원 수" value={summaryLoading ? "..." : `${memberCount}명`} sub="프로젝트 멤버" color="#3B5BDB" icon={Users} />
        <DetailStatCard label="1인 평균 업무" value={summaryLoading ? "..." : `${averageInProgressTasks}개`} sub="진행 중 배정 기준" color="#7048E8" icon={Layers} />
        <DetailStatCard label="점검 필요" value={summaryLoading ? "..." : `${overloaded.length}명`} sub="블로커 또는 과부하" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="업무 균형" value={summaryLoading ? "..." : balanceLabel} sub="실제 배정 기준" color="#F59E0B" icon={BarChart3} />
      </div>

      <AIBox text="미구현된 기능입니다." />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">팀원별 업무 현황 비교</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {[{ color: "#10B981", label: "완료" }, { color: "#3B5BDB", label: "진행중" }, { color: "#C1C9D9", label: "대기" }, { color: "#EF4444", label: "블로커" }].map(item => (
                <span key={item.label} className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ background: item.color }} />{item.label}</span>
              ))}
            </div>
          </div>
          <div className="h-48">
            {summaryLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">데이터를 불러오는 중입니다</div>
            ) : barData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Bar dataKey="완료" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="진행중" stackId="a" fill="#3B5BDB" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="대기" stackId="a" fill="#C1C9D9" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="블로커" stackId="a" fill="#EF4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">업무량 데이터가 없습니다.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">완료율 비교</div>
          <div className="space-y-4">
            {workload.map((entry, index) => {
              const member = resolveMemberDisplay(entry.assigneeName, index, entry.assigneeId);
              const pct = entry.total === 0 ? 0 : Math.round((entry.done / entry.total) * 100);
              const isOverload = entry.blocked > 0 || entry.total === maxWorkload && maxWorkload > averageTasks;
              return (
                <div key={entry.assigneeId}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: member.color }}>{member.initials}</div>
                      <span className="font-medium text-foreground">{member.name}</span>
                      {isOverload && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600">점검</span>}
                    </div>
                    <span className={`font-semibold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: member.color }} /></div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{entry.done}/{entry.total}개 · 블로커 {entry.blocked}개</div>
                </div>
              );
            })}
            {(summaryLoading || workload.length === 0) && (
              <div className="text-sm text-muted-foreground">
                {summaryLoading ? "데이터를 불러오는 중입니다" : "팀원 데이터가 없습니다."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {workload.map((entry, index) => {
          const member = resolveMemberDisplay(entry.assigneeName, index, entry.assigneeId);
          const pct = entry.total === 0 ? 0 : Math.round((entry.done / entry.total) * 100);
          const isSelected = selectedMember === entry.assigneeId;
          const isOverload = entry.blocked > 0 || entry.total === maxWorkload && maxWorkload > averageTasks;
          return (
            <button key={entry.assigneeId} onClick={() => setSelectedMember(isSelected ? null : entry.assigneeId)} className={`bg-card rounded-xl p-5 border-2 cursor-pointer transition-all shadow-sm hover:shadow-md text-left ${isSelected ? "border-blue-400" : isOverload ? "border-red-200" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: member.color }}>{member.initials}</div>
                  <div><div className="text-sm font-semibold text-foreground">{member.name}</div><div className="text-xs text-muted-foreground">{member.role}</div></div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isOverload && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">점검 필요</span>}
                  <span className={`text-lg font-bold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[{ label: "전체", value: entry.total, color: "#3B5BDB" }, { label: "완료", value: entry.done, color: "#10B981" }, { label: "진행", value: entry.inProgress, color: "#3B5BDB" }, { label: "블로커", value: entry.blocked, color: "#EF4444" }].map(item => (
                  <div key={item.label} className="text-center p-1.5 rounded-lg bg-muted">
                    <div className="text-sm font-bold" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-[9px] text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: member.color }} /></div>
            </button>
          );
        })}
        {(summaryLoading || workload.length === 0) && (
          <div className="col-span-2 h-40 flex items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
            {summaryLoading ? "데이터를 불러오는 중입니다" : "팀원 데이터가 없습니다."}
          </div>
        )}
      </div>

      {selectedMember && (() => {
        const workloadEntry = workload.find(entry => entry.assigneeId === selectedMember);
        const member = resolveMemberDisplay(workloadEntry?.assigneeName, workload.findIndex(entry => entry.assigneeId === selectedMember), selectedMember);
        return (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: member.color }}>{member.initials}</div>
                <span className="text-sm font-semibold text-foreground">{member.name}의 업무 목록</span>
              </div>
              <button onClick={() => setSelectedMember(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="divide-y divide-border">
              {selectedTasks.map((task, index) => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                  <span className="font-mono text-[10px] text-muted-foreground w-12">{task.id}</span>
                  <span className="flex-1 text-xs font-medium text-foreground truncate">{task.title}</span>
                  <TaskStatusPill status={normalizeTaskStatus(task.status)} />
                  <PriorityBadge priority={normalizePriority(task.priority)} />
                  <span className="text-xs text-muted-foreground w-12 text-right">{formatDashboardDueDate(task.dueDate)}</span>
                  <button onClick={() => navigate("/board")} className="text-[11px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">보드</button>
                </div>
              ))}
              {(tasksLoading || selectedTasks.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  {tasksLoading ? "데이터를 불러오는 중입니다" : "배정된 업무가 없습니다."}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
