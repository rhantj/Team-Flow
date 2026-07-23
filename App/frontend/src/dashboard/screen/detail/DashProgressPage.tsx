import { useState } from "react";
import { useNavigate } from "react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Calendar, Clock, FileText, Plus, Sparkles, Target } from "lucide-react";
import { AiInsightBox } from "../../../ai/components/AiInsightBox";
import { openAIAssistant } from "../../../ai/libs/utils/openAIAssistant";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import type { TaskStatus } from "../../../board/libs/types/task";
import { useAuth } from "../../../global/hooks/useAuth";
import { useDashboardProgress } from "../../libs/hooks/useDashboardProgress";
import { MilestoneAddPopup } from "../../components/MilestoneAddPopup";
import {
  expectedProgressPercent,
  formatDashboardDueDate,
  formatDDay,
  isDelayRisk,
} from "../../libs/utils/dashboardTaskUtils";

const CATEGORY_COLORS = ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

const MILESTONE_STATUS_MAP: Record<TaskStatus, { cls: string; label: string }> = {
  done: { cls: "bg-emerald-100 text-emerald-700", label: "완료" },
  inprogress: { cls: "bg-blue-100 text-blue-700", label: "진행 중" },
  todo: { cls: "bg-slate-100 text-slate-500", label: "예정" },
  blocked: { cls: "bg-red-100 text-red-700", label: "지연" },
};

const STAGE_LEGEND = [
  { label: "완료 (100%)", color: "#10B981" },
  { label: "진행 중 (50%+)", color: "#3B5BDB" },
  { label: "시작 (1~49%)", color: "#F59E0B" },
  { label: "미착수 (0%)", color: "#C1C9D9" },
];

function normalizeMilestoneStatus(status: string): TaskStatus {
  const normalized = status.toLowerCase() as TaskStatus;
  return normalized in MILESTONE_STATUS_MAP ? normalized : "todo";
}

export function DashProgressPage() {
  const { user, currentProjectId } = useAuth();
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const onGoUrgent = () => navigate("/dashboard/urgent");
  const { data: progress, loading, error, refetch } = useDashboardProgress(currentProjectId);
  const [showMilestonePopup, setShowMilestonePopup] = useState(false);

  const totalTasks = progress?.totalTasks ?? 0;
  const doneTasks = progress?.doneTasks ?? 0;
  const progressPercent = progress?.progressPercent ?? 0;
  const delayRisks = progress?.delayRisks.filter(risk => isDelayRisk(risk.result)) ?? [];
  const categories = progress?.categoryBreakdown ?? [];
  const milestones = progress?.milestones ?? [];
  const projectCreatedAt = progress?.projectCreatedAt ?? null;
  const projectDeadline = progress?.projectDeadline ?? null;
  const expectedProgress = expectedProgressPercent(projectCreatedAt, projectDeadline);
  const planGap = expectedProgress == null ? null : progressPercent - expectedProgress;
  const planGapLabel = planGap == null ? "-" : `${planGap > 0 ? "+" : ""}${planGap}%p`;
  const planGapColor = planGap == null ? "#8892A4" : planGap < 0 ? "#EF4444" : planGap > 0 ? "#10B981" : "#8892A4";
  const projectDDay = formatDDay(projectDeadline);
  const insightPrompt = `현재 프로젝트의 진행 상황을 분석해줘. 실제 완료율은 ${progressPercent}%, 계획상 예상 진행률은 ${expectedProgress ?? "미정"}%, 지연 주의·위험 업무는 ${delayRisks.length}개, 프로젝트 마감은 ${projectDDay}야. 계획 대비 차이와 주요 위험, 권장 조치를 정리해줘. 출력은 3문장 이내로 해.`;
  const insightFallback = "계획 대비 진행률과 지연 예측을 바탕으로 다음 액션을 추천받을 수 있습니다.";

  const planVsActualChart: Array<{ label: string; 예상?: number; 실제: number | null }> = projectCreatedAt
    ? [
        { label: formatDashboardDueDate(projectCreatedAt), 예상: 0, 실제: 0 },
        { label: "오늘", 예상: expectedProgress ?? undefined, 실제: progressPercent },
        ...(projectDeadline ? [{ label: formatDashboardDueDate(projectDeadline), 예상: 100, 실제: null }] : []),
      ]
    : [];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">전체 진행률</h1>
          <p className="text-sm text-muted-foreground mt-0.5">프로젝트 일정 대비 진행 현황을 분석하고 지연 위험을 파악합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onGoUrgent} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />마감 업무</button>
          <button onClick={() => openAIAssistant(insightPrompt)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />진행률 보고서</button>
          <button onClick={() => openAIAssistant(insightPrompt)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
            <Sparkles className="w-3.5 h-3.5" />AI 요약 요청
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-5 gap-3">
        <DetailStatCard label="전체 완료율" value={loading ? "..." : `${progressPercent}%`} sub={loading ? "불러오는 중" : `${doneTasks} / ${totalTasks} 완료`} color="#3B5BDB" icon={Target} />
        <DetailStatCard label="계획 대비" value={loading ? "..." : planGapLabel} sub={expectedProgress == null ? "프로젝트 일정 미정" : `예상 ${expectedProgress}% · 실제 ${progressPercent}%`} color={planGapColor} icon={Target} />
        <DetailStatCard label="지연 업무" value={loading ? "..." : `${delayRisks.length}개`} sub="즉시 검토 필요" color="#EF4444" icon={Clock} />
        <DetailStatCard label="마감 D-day" value={loading ? "..." : projectDDay} sub={formatDashboardDueDate(projectDeadline)} color="#F59E0B" icon={Calendar} iconBorder />
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div className="text-xs font-medium text-foreground mb-2">상태 범례</div>
          <div className="space-y-1.5">
            {[
              { label: "정상", color: "#10B981" },
              { label: "주의", color: "#F59E0B" },
              { label: "위험", color: "#EF4444" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AiInsightBox
        projectId={currentProjectId}
        prompt={insightPrompt}
        ready={!loading}
        fallbackText={insightFallback}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">계획 대비 실제 진행률</div>
            <div className="text-xs text-muted-foreground">{projectDeadline ? "예상 vs 실제" : "마감일 미정 · 실제만 표시"}</div>
          </div>
          <div className="h-52">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">데이터를 불러오는 중입니다</div>
            ) : planVsActualChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={planVsActualChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {projectDeadline && <Line type="monotone" dataKey="예상" name="예상 진행률" stroke="#C1C9D9" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />}
                  <Line type="monotone" dataKey="실제" name="실제 진행률" stroke="#7048E8" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">표시할 진행률 데이터가 없습니다.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-3">단계별 진행 상태</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
            {STAGE_LEGEND.map(item => (
              <div key={item.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-3.5">
            {categories.map((item, index) => {
              const pct = item.total === 0 ? 0 : Math.round((item.done / item.total) * 100);
              const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-foreground">{item.category}</span>
                    <span className={`font-semibold ${pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-blue-600" : pct > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full"><div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
            {(loading || categories.length === 0) && (
              <div className="text-sm text-muted-foreground">
                {loading ? "데이터를 불러오는 중입니다" : "카테고리 데이터가 없습니다."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">마일스톤 진행 현황</div>
          <button onClick={() => setShowMilestonePopup(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
            <Plus className="w-3.5 h-3.5" /> 마일스톤 추가
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["ID", "마일스톤", "마감일", "상태", "진행률", "관련 업무", "액션"].map(header => (
                <th key={header} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {milestones.map(item => {
              const status = MILESTONE_STATUS_MAP[normalizeMilestoneStatus(item.status)];
              return (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{item.id}</td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground">{item.title}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDashboardDueDate(item.dueDate)}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${item.progressPercent}%`, background: item.progressPercent === 100 ? "#10B981" : item.progressPercent > 0 ? "#3B5BDB" : "#C1C9D9" }} /></div>
                      <span className="text-xs font-semibold text-foreground">{item.progressPercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.taskCount > 0 ? `${item.taskCount}개` : "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate("/dashboard/all-tasks")} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">업무 보기</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(loading || milestones.length === 0) && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {loading ? "데이터를 불러오는 중입니다" : "마일스톤 데이터가 없습니다."}
          </div>
        )}
      </div>

      {showMilestonePopup && currentProjectId != null && (
        <MilestoneAddPopup
          projectId={currentProjectId}
          onClose={() => setShowMilestonePopup(false)}
          onCreated={() => { setShowMilestonePopup(false); refetch(); }}
        />
      )}
    </div>
  );
}
