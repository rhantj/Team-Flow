import { useState } from "react";
import { useNavigate } from "react-router";
import { BackBtn } from "../../../global/component/BackBtn";
import { useStoredTasks } from "../../../global/hooks/useStoredTasks";
import { PROGRESS_HISTORY, STAGES } from "../../libs/mock/workload";
import { MILESTONES } from "../../libs/mock/milestones";
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
} from "lucide-react";

export function DashProgressPage() {
  const TASKS = useStoredTasks();
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const onGoUrgent = () => navigate("/dashboard/urgent");
  const [period, setPeriod] = useState("전체");

  const milestoneStatus = (s: TaskStatus) => {
    const map = { done: { cls: "bg-emerald-100 text-emerald-700", label: "완료" }, inprogress: { cls: "bg-blue-100 text-blue-700", label: "진행 중" }, todo: { cls: "bg-slate-100 text-slate-500", label: "예정" }, blocked: { cls: "bg-red-100 text-red-700", label: "지연" } };
    return map[s];
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">전체 진행률</h1><p className="text-sm text-muted-foreground mt-0.5">프로젝트 일정 대비 진행 현황을 분석하고 지연 위험을 파악합니다.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={onGoUrgent} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />지연 업무 바로가기</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />리포트 PDF</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3.5 h-3.5" />AI 요약 요청</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 완료율" value="29%" sub="4 / 14 완료" color="#3B5BDB" icon={TrendingUp} />
        <DetailStatCard label="계획 대비" value="-11%" sub="목표보다 낮음" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="지연 업무" value="3개" sub="즉시 검토 필요" color="#EF4444" icon={Clock} />
        <DetailStatCard label="마감 D-day" value="D-18" sub="2024.12.28" color="#F59E0B" icon={Calendar} />
      </div>

      <AIBox text="테스트 단계가 계획보다 3일 지연되고 있습니다. TF-13(DB 인덱싱) 블로커가 해결되지 않으면 개발 완료가 12.15를 넘길 수 있습니다. 담당자 재배정 또는 범위 축소를 검토하세요." onAsk={() => {}} />

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

        {/* Stage progress */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">단계별 진행 상태</div>
          <div className="space-y-3.5">
            {STAGES.map(s => (
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
            {MILESTONES.map(m => {
              const st = milestoneStatus(m.status);
              return (
                <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{m.id}</td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground">{m.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.date}</td>
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

// ─── page 6: urgent tasks ─────────────────────────────────────────────────────
