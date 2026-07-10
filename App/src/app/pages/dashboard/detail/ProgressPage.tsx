import { useNavigate } from "react-router";
import { BackBtn } from "../../../components/common/BackBtn";
import { CircleProgress } from "../../../components/common/CircleProgress";
import { AIBox } from "../../../components/common/AIBox";
import { TASKS } from "../../../data/tasks";
import { PROGRESS_HISTORY, PLANNED_VS_ACTUAL, PROGRESS_BY_TYPE } from "../../../data/workload";
import { MILESTONES } from "../../../data/milestones";
import { getDoneCount, getProgressPercent } from "../../../services/taskService";
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  CheckSquare,
  TrendingUp,
} from "lucide-react";

export function ProgressPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">진행률 분석</h1>
          <p className="text-sm text-muted-foreground mt-0.5">완료율 29%의 원인을 분석하고 마감 전 완료 가능성을 판단합니다.</p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
          <Sparkles className="w-4 h-4" /> 진행률 보고서 생성
        </button>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 완료율" value="29%" sub="4 / 14 완료" color="#3B5BDB" icon={TrendingUp} />
        <DetailStatCard label="완료" value="4개" sub="전체 14개 중" color="#10B981" icon={CheckCircle2} />
        <DetailStatCard label="목표 완료율" value="100%" sub="12.28 마감 기준" color="#7048E8" icon={CheckSquare} />
        <DetailStatCard label="남은 기간" value="D-18" sub="이번 주 완료 +2개" color="#F59E0B" icon={Calendar} />
      </div>

      {/* AI box */}
      <AIBox
        text="현재 주당 완료 속도 2개 기준, 남은 10개 업무 완료에 약 5주 필요합니다. 블로커 2개 해결 + 주당 4개 달성 시 D-18 내 완료 가능합니다."
        onAsk={() => {}}
      />

      {/* main: circle + AI prediction + assignee */}
      <div className="grid grid-cols-3 gap-4">
        {/* circle progress */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <CircleProgress pct={29} size={156} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-bold text-foreground">29%</div>
              <div className="text-[11px] text-muted-foreground">완료율</div>
            </div>
          </div>
          <div className="w-full border-t border-border pt-3 space-y-2">
            {[
              { label: "완료",   count: 4, color: "#10B981" },
              { label: "진행 중", count: 4, color: "#3B5BDB" },
              { label: "대기",   count: 4, color: "#C1C9D9" },
              { label: "블로커", count: 2, color: "#EF4444" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
                <span className="font-semibold text-foreground">{s.count}개</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI prediction */}
        <div className="flex flex-col gap-3">
          <div className="bg-card rounded-xl p-4 border border-border shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-foreground">AI 완료 예측</span>
            </div>
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
                <div className="font-semibold mb-1">⚠ 현재 속도 기준: 마감 내 완료 불확실</div>
                주당 2개 완료 속도로는 남은 10개 처리에 약 5주 필요 (현재 D-18).
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs leading-relaxed">
                <div className="font-semibold mb-1">💡 속도 개선 시: 완료 가능</div>
                블로커 2개 해결 + 주당 4개 완료 달성 시 D-18 내 100% 완료 가능.
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">이번 주 완료된 업무</div>
            {TASKS.filter(t => t.status === "done").slice(0, 3).map(t => {
              const m = MEMBERS.find(me => me.id === t.assignee)!;
              return (
                <div key={t.id} className="flex items-center gap-2 py-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">{t.title}</span>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: m.color }}>{m.initials}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* assignee completion */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">담당자별 완료 현황</div>
            <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700">업무 재배정</button>
          </div>
          <div className="space-y-4">
            {WORKLOAD_DATA.map(m => {
              const pct = Math.round((m.done / m.total) * 100);
              return (
                <div key={m.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>
                        {m.name[0]}
                      </div>
                      <span className="font-medium text-foreground">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-mono">{m.done}/{m.total}</span>
                      <span className={`font-semibold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* type + deliverable */}
      <div className="grid grid-cols-2 gap-4">
        {/* type completion */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">업무 유형별 완료율</div>
            <button className="text-[11px] font-medium text-blue-600">우선순위 조정</button>
          </div>
          <div className="divide-y divide-border">
            {PROGRESS_BY_TYPE.map(t => {
              const pct = Math.round((t.done / t.total) * 100);
              return (
                <div key={t.type} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="w-14 text-xs font-medium text-foreground shrink-0">{t.type}</div>
                  <div className="flex-1 h-1.5 bg-muted rounded-full">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: t.color }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{t.done}/{t.total}</span>
                  <span className={`text-[10px] font-bold w-8 text-right ${pct === 100 ? "text-emerald-600" : pct === 0 ? "text-red-500" : "text-amber-600"}`}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* deliverable readiness */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">산출물 준비율</div>
            <button className="text-[11px] font-medium text-blue-600">산출물 생성</button>
          </div>
          <div className="divide-y divide-border">
            {DELIVERABLE_READY.map(d => {
              const color = d.pct === 100 ? "#10B981" : d.pct >= 50 ? "#3B5BDB" : d.pct > 0 ? "#F59E0B" : "#DFE1E6";
              const badge = d.pct === 100 ? { cls: "bg-emerald-100 text-emerald-600", label: "완료" }
                : d.pct === 0 ? { cls: "bg-slate-100 text-slate-500", label: "미시작" }
                : { cls: "bg-amber-100 text-amber-600", label: "작성 중" };
              return (
                <div key={d.name} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="w-20 text-xs font-medium text-foreground shrink-0">{d.name}</div>
                  <div className="flex-1 h-1.5 bg-muted rounded-full">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${d.pct}%`, background: color }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{d.pct}%</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── page 3: blockers ─────────────────────────────────────────────────────────
