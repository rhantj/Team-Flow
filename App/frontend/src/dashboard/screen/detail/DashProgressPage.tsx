import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Calendar, Clock, FileText, Loader2, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { AIBox } from "../../../ai/components/AIBox";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import type { TaskStatus } from "../../../board/libs/types/task";
import { useAuth } from "../../../global/hooks/useAuth";
import { useDashboardProgress } from "../../libs/hooks/useDashboardProgress";
import { formatDashboardDueDate } from "../../libs/utils/dashboardTaskUtils";

const CATEGORY_COLORS = ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

const MILESTONE_STATUS_MAP: Record<TaskStatus, { cls: string; label: string }> = {
  done: { cls: "bg-emerald-100 text-emerald-700", label: "완료" },
  inprogress: { cls: "bg-blue-100 text-blue-700", label: "진행 중" },
  todo: { cls: "bg-slate-100 text-slate-500", label: "예정" },
  blocked: { cls: "bg-red-100 text-red-700", label: "지연" },
};

function normalizeMilestoneStatus(status: string): TaskStatus {
  const normalized = status.toLowerCase() as TaskStatus;
  return normalized in MILESTONE_STATUS_MAP ? normalized : "todo";
}

function isDangerResult(result: string) {
  const normalized = result.toLowerCase();
  return result.includes("위험") || normalized.includes("danger") || normalized.includes("high");
}

export function DashProgressPage() {
  const { currentProjectId } = useAuth();
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const onGoUrgent = () => navigate("/dashboard/urgent");
  const { data: progress, loading, refreshing, error, runDelayRiskAnalysis } = useDashboardProgress(currentProjectId);

  const totalTasks = progress?.totalTasks ?? 0;
  const doneTasks = progress?.doneTasks ?? 0;
  const progressPercent = progress?.progressPercent ?? 0;
  const delayRisks = progress?.delayRisks ?? [];
  const hasPredictions = progress?.hasPredictions ?? false;
  const categories = progress?.categoryBreakdown ?? [];
  const milestones = progress?.milestones ?? [];
  const categoryChart = categories.map(item => ({
    category: item.category,
    완료: item.done,
    미완료: Math.max(item.total - item.done, 0),
  }));

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">전체 진행률</h1>
          <p className="text-sm text-muted-foreground mt-0.5">실제 업무, 마일스톤, AI 지연 예측 결과를 한 화면에서 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onGoUrgent} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />마감 업무</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />리포트</button>
          <button onClick={() => runDelayRiskAnalysis()} disabled={refreshing || currentProjectId == null} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI 지연 위험 분석
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 완료율" value={loading ? "..." : `${progressPercent}%`} sub={loading ? "불러오는 중" : `${doneTasks} / ${totalTasks} 완료`} color="#3B5BDB" icon={TrendingUp} />
        <DetailStatCard label="미완료 업무" value={loading ? "..." : `${Math.max(totalTasks - doneTasks, 0)}개`} sub="완료 전 상태" color="#F59E0B" icon={AlertTriangle} />
        <DetailStatCard label="지연 위험 업무" value={loading ? "..." : `${delayRisks.length}개`} sub={hasPredictions ? "AI 분석 결과" : "분석 필요"} color="#EF4444" icon={Clock} />
        <DetailStatCard label="마일스톤" value={loading ? "..." : `${milestones.length}개`} sub="등록된 일정" color="#7048E8" icon={Calendar} />
      </div>

      <AIBox text="미구현된 기능입니다." />

      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <div className="text-sm font-semibold text-foreground">AI 지연 위험도</div>
          </div>
          <button onClick={() => runDelayRiskAnalysis()} disabled={refreshing || currentProjectId == null} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50 transition-colors">
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hasPredictions ? "다시 분석" : "분석 실행"}
          </button>
        </div>
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">데이터를 불러오는 중입니다</div>
        ) : delayRisks.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {hasPredictions ? "현재 지연 위험으로 분류된 업무가 없습니다." : "아직 실행된 분석이 없습니다."}
          </div>
        ) : (
          <div className="space-y-2">
            {delayRisks.map(risk => (
              <div key={risk.taskId} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${isDangerResult(risk.result) ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {risk.result}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{risk.taskTitle}</div>
                  <div className="text-[10px] text-muted-foreground">{risk.assigneeName ?? "미배정"} · 마감 {formatDashboardDueDate(risk.dueDate)}</div>
                </div>
                {risk.score != null && <span className="text-[10px] text-muted-foreground shrink-0">신뢰도 {Math.round(risk.score * 100)}%</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">카테고리별 완료/미완료</div>
            <div className="text-xs text-muted-foreground">tasks.category 기준</div>
          </div>
          <div className="h-52">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">데이터를 불러오는 중입니다</div>
            ) : categoryChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChart} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#8892A4" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Bar dataKey="완료" stackId="tasks" fill="#10B981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="미완료" stackId="tasks" fill="#C1C9D9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">카테고리 데이터가 없습니다.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">카테고리별 진행 상태</div>
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
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["ID", "마일스톤", "마감일", "상태", "진행률", "관련 업무"].map(header => (
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
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.taskCount}개</td>
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
    </div>
  );
}
