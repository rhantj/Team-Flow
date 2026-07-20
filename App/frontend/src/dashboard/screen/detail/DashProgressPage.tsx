import { useState } from "react";
import { useNavigate } from "react-router";
import { BackBtn } from "../../../global/component/BackBtn";
import { DetailStatCard } from "../../../global/component/DetailStatCard";
import { AIBox } from "../../../ai/components/AIBox";
import { useStoredTasks } from "../../../global/hooks/useStoredTasks";
import { useDashboardProgress } from "../../libs/hooks/useDashboardProgress";
import { PLANNED_VS_ACTUAL, STAGES } from "../../libs/mock/workload";
import { MILESTONES } from "../../libs/mock/milestones";
import type { TaskStatus } from "../../../board/libs/types/task";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  Sparkles,
  AlertTriangle,
  Clock,
  Calendar,
  FileText,
  TrendingUp,
  ShieldAlert,
  Loader2,
} from "lucide-react";

const CATEGORY_COLORS = ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

const MILESTONE_STATUS_MAP: Record<TaskStatus, { cls: string; label: string }> = {
  done: { cls: "bg-emerald-100 text-emerald-700", label: "완료" },
  inprogress: { cls: "bg-blue-100 text-blue-700", label: "진행 중" },
  todo: { cls: "bg-slate-100 text-slate-500", label: "예정" },
  blocked: { cls: "bg-red-100 text-red-700", label: "지연" },
};

export function DashProgressPage() {
  const TASKS = useStoredTasks();
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const onGoUrgent = () => navigate("/dashboard/urgent");
  const [period, setPeriod] = useState("전체");
  const { data: progress, refreshing, error, runDelayRiskAnalysis } = useDashboardProgress();

  const totalTasks = progress?.totalTasks ?? TASKS.length;
  const doneTasks = progress?.doneTasks ?? TASKS.filter(t => t.status === "done").length;
  const progressPercent = progress?.progressPercent ?? 29;
  const delayRisks = progress?.delayRisks ?? [];
  const hasPredictions = progress?.hasPredictions ?? false;

  const aiSummaryText = !progress
    ? "테스트 단계가 계획보다 3일 지연되고 있습니다. TF-13(DB 인덱싱) 블로커가 해결되지 않으면 개발 완료가 12.15를 넘길 수 있습니다. 담당자 재배정 또는 범위 축소를 검토하세요."
    : !hasPredictions
      ? "아직 AI 지연 위험도 분석이 실행되지 않았습니다. 아래 \"AI 지연 위험도 분석 실행\" 버튼을 눌러 진행해보세요."
      : delayRisks.length > 0
        ? `AI가 ${delayRisks.length}개 업무에서 지연 위험(주의/위험)을 감지했습니다. 아래 목록에서 우선순위가 높은 업무부터 확인하세요.`
        : "AI 분석 결과 현재 지연 위험이 감지된 업무가 없습니다.";

  // 카테고리별 완료 현황은 Postgres에서 바로 계산 가능하지만, "계획 대비 실제 진행률" 추이
  // 차트는 과거 스냅샷을 저장하는 테이블이 아직 없어 mock 데이터를 그대로 쓴다 (알려진 한계).
  const liveCategories = progress && progress.categoryBreakdown.length > 0 ? progress.categoryBreakdown : null;
  const stageRows = liveCategories
    ? liveCategories.map((c, i) => ({
        name: c.category,
        pct: c.total === 0 ? 0 : Math.round((c.done / c.total) * 100),
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }))
    : STAGES;

  const liveMilestones = progress && progress.milestones.length > 0 ? progress.milestones : null;
  const milestoneRows = liveMilestones
    ? liveMilestones.map(m => ({
        id: m.id,
        title: m.title,
        dueDate: m.dueDate ?? "미정",
        status: m.status as TaskStatus,
        progress: m.progressPercent,
        tasks: m.taskCount,
      }))
    : MILESTONES.map(m => ({
        id: m.id,
        title: m.name,
        dueDate: m.date,
        status: m.status,
        progress: m.progress,
        tasks: m.tasks,
      }));

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">전체 진행률</h1><p className="text-sm text-muted-foreground mt-0.5">프로젝트 일정 대비 진행 현황을 분석하고 지연 위험을 파악합니다.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={onGoUrgent} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />지연 업무 바로가기</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />리포트 PDF</button>
          <button
            onClick={() => runDelayRiskAnalysis()}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI 요약 요청
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 완료율" value={`${progressPercent}%`} sub={`${doneTasks} / ${totalTasks} 완료`} color="#3B5BDB" icon={TrendingUp} />
        <DetailStatCard label="계획 대비" value="-11%" sub="목표보다 낮음" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="지연 업무" value={`${delayRisks.length}개`} sub={hasPredictions ? "AI 분석 결과" : "분석 필요"} color="#EF4444" icon={Clock} />
        <DetailStatCard label="마감 D-day" value="D-18" sub="2024.12.28" color="#F59E0B" icon={Calendar} />
      </div>

      <AIBox text={aiSummaryText} onAsk={() => runDelayRiskAnalysis()} />

      {/* AI 지연 위험도 (ml_delay_risk 모델 예측 결과) */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <div className="text-sm font-semibold text-foreground">AI 지연 위험도</div>
          </div>
          <button
            onClick={() => runDelayRiskAnalysis()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50 transition-colors"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hasPredictions ? "다시 분석" : "AI 지연 위험도 분석 실행"}
          </button>
        </div>
        {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
        {delayRisks.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {hasPredictions ? "현재 지연 위험(주의/위험)이 감지된 업무가 없습니다." : "아직 실행된 분석이 없습니다."}
          </div>
        ) : (
          <div className="space-y-2">
            {delayRisks.map(risk => (
              <div key={risk.taskId} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    risk.result === "위험" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {risk.result}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{risk.taskTitle}</div>
                  <div className="text-[10px] text-muted-foreground">{risk.assigneeName ?? "미배정"} · 마감 {risk.dueDate ?? "미정"}</div>
                </div>
                {risk.score != null && (
                  <span className="text-[10px] text-muted-foreground shrink-0">확신도 {Math.round(risk.score * 100)}%</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">기간 필터</span>
        {["전체", "이번 주", "이번 달", "발표 전까지"].map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${period === p ? "bg-blue-600 text-white border-blue-600" : "bg-card border-border text-muted-foreground hover:border-slate-300"}`}>{p}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><div className="w-2.5 h-0.5 rounded" style={{ background: "#3B5BDB" }} />실제 진행률</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><div className="w-2.5 h-0.5 rounded border border-dashed border-slate-400" />계획 진행률</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Planned vs Actual chart */}
        <div className="col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">계획 대비 실제 진행률</div>
            <div className="text-xs text-muted-foreground">기준: 주별 완료 업무 수</div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PLANNED_VS_ACTUAL} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="planGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop key="p1" offset="5%" stopColor="#C1C9D9" stopOpacity={0.2} />
                    <stop key="p2" offset="95%" stopColor="#C1C9D9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop key="a1" offset="5%" stopColor="#3B5BDB" stopOpacity={0.2} />
                    <stop key="a2" offset="95%" stopColor="#3B5BDB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid key="cg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="x" dataKey="week" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="y" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="tt" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Area key="plan" type="monotone" dataKey="planned" name="계획" stroke="#C1C9D9" strokeWidth={2} strokeDasharray="4 2" fill="url(#planGrad)" />
                <Area key="actual" type="monotone" dataKey="actual" name="실제" stroke="#3B5BDB" strokeWidth={2} fill="url(#actGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-700">12/2 이후 실제 진행률이 계획보다 <strong>11% 낮아졌습니다.</strong> 블로커 해결이 시급합니다.</span>
          </div>
        </div>

        {/* Stage / category progress */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">{liveCategories ? "카테고리별 진행 상태" : "단계별 진행 상태"}</div>
          <div className="space-y-3.5">
            {stageRows.map(s => (
              <div key={s.name}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className={`font-semibold ${s.pct === 100 ? "text-emerald-600" : s.pct >= 50 ? "text-blue-600" : s.pct > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{s.pct}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">상태 범례</div>
            {[{ color: "#10B981", label: "완료·양호" }, { color: "#3B5BDB", label: "진행 중" }, { color: "#F59E0B", label: "지연 위험" }, { color: "#C1C9D9", label: "미시작" }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
                <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Milestone table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">마일스톤 진행 현황</div>
          <button className="text-xs font-medium text-blue-600 hover:text-blue-700">+ 마일스톤 추가</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/40">
            {["ID", "마일스톤", "마감일", "상태", "진행률", "관련 업무", ""].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {milestoneRows.map(m => {
              const st = MILESTONE_STATUS_MAP[m.status];
              return (
                <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{m.id}</td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground">{m.title}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.dueDate}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${m.progress}%`, background: m.progress === 100 ? "#10B981" : m.progress > 0 ? "#3B5BDB" : "#C1C9D9" }} /></div>
                      <span className="text-xs font-semibold text-foreground">{m.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.tasks}개</td>
                  <td className="px-4 py-3"><button className="text-[11px] font-medium text-blue-600 hover:text-blue-700">업무 보기</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
