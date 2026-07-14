import { useState } from "react";
import { useNavigate } from "react-router";
import { BackBtn } from "../../../global/component/BackBtn";
import { ACTIVITY_LOG } from "../../libs/mock/activity-log";
import { MEMBERS } from "../../../global/lib/mock/members";
import {
  Github,
  Sparkles,
  Search,
  Zap,
  FileText,
  TrendingUp,
} from "lucide-react";

export function ActivityPage() {
  const navigate = useNavigate();
  const onBack = () => navigate("/dashboard");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [memberFilter, setMemberFilter] = useState("전체");
  const [search, setSearch] = useState("");

  const typeFilters = ["전체", "업무", "GitHub", "회의록", "AI", "산출물", "댓글"];
  const typeMap: Record<string, ActivityType[]> = {
    "업무":   ["task_create", "task_update"],
    "GitHub": ["commit", "pr", "merge"],
    "회의록": ["meeting"],
    "AI":     ["ai"],
    "산출물": ["deliverable", "file"],
    "댓글":   ["comment"],
  };

  const filtered = ACTIVITY_LOG.filter(a => {
    const mt = typeFilter === "전체" || typeMap[typeFilter]?.includes(a.type);
    const mm = memberFilter === "전체" || a.actor === memberFilter;
    const ms = !search || a.message.toLowerCase().includes(search.toLowerCase());
    return mt && mm && ms;
  });

  const todayCount = ACTIVITY_LOG.filter(a => ["방금 전", "1시간 전", "3시간 전", "5시간 전", "6시간 전"].includes(a.time)).length;
  const weekCount = ACTIVITY_LOG.length;
  const githubCount = ACTIVITY_LOG.filter(a => ["commit", "pr", "merge"].includes(a.type)).length;
  const aiCount = ACTIVITY_LOG.filter(a => a.type === "ai" || a.actor === "AI").length;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">최근 활동</h1><p className="text-sm text-muted-foreground mt-0.5">팀 전체 활동을 타임라인으로 확인하고 중요 변경사항을 파악합니다.</p></div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />활동 로그 내보내기</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3.5 h-3.5" />AI 주간 요약 생성</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="오늘 활동" value={todayCount} sub="오늘 기준" color="#3B5BDB" icon={Zap} />
        <DetailStatCard label="이번 주 전체" value={weekCount} sub="최근 5일" color="#7048E8" icon={TrendingUp} />
        <DetailStatCard label="GitHub 활동" value={githubCount} sub="커밋·PR·머지" color="#10B981" icon={Github} />
        <DetailStatCard label="AI 생성" value={aiCount} sub="자동 생성 항목" color="#7048E8" icon={Sparkles} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {typeFilters.map(f => (
          <button key={f} onClick={() => setTypeFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${typeFilter === f ? "bg-blue-600 text-white border-blue-600" : "bg-card border-border text-muted-foreground hover:border-slate-300"}`}>{f}</button>
        ))}
        <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="ml-2 text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none">
          <option>전체</option>{MEMBERS.map(m => <option key={m.id}>{m.name}</option>)}<option>AI</option>
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="활동 검색..." className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 w-44" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Timeline */}
        <div className="col-span-2 space-y-1">
          {filtered.map((a, i) => {
            const meta = ACTIVITY_ICONS[a.type];
            const IconComp = meta.icon;
            const actorMember = MEMBERS.find(m => m.name === a.actor);
            const isLast = i === filtered.length - 1;
            return (
              <div key={a.id} className="flex gap-3">
                {/* timeline line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                    <IconComp className="w-3.5 h-3.5" style={{ color: meta.color }} />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 bg-border my-1" />}
                </div>
                {/* content */}
                <div className={`flex-1 bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow cursor-pointer mb-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded`} style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                        {actorMember && (
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: actorMember.color }}>{actorMember.initials}</div>
                            <span className="text-[10px] font-medium text-foreground">{a.actor}</span>
                          </div>
                        )}
                        {!actorMember && <span className="text-[10px] font-medium" style={{ color: meta.color }}>{a.actor}</span>}
                      </div>
                      <div className="text-xs text-foreground leading-relaxed">{a.message}</div>
                      {a.target && <div className="mt-1"><span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.target}</span></div>}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{a.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">해당 활동이 없습니다.</div>
          )}
        </div>

        {/* AI weekly summary */}
        <div className="space-y-3">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border" style={{ background: "rgba(112,72,232,0.05)" }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3 h-3 text-white" /></div>
              <span className="text-sm font-semibold text-foreground">AI 주간 활동 요약</span>
            </div>
            <div className="p-4 space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800"><div className="font-semibold mb-1">📊 이번 주 활동 패턴</div>이번 주 활동은 개발 업무(GitHub 커밋 5건)와 회의록 기반 업무 생성에 집중되어 있습니다.</div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800"><div className="font-semibold mb-1">⚠ 상대적으로 부족한 영역</div>발표자료 작업이 1건에 그쳤습니다. 마감 D-18을 고려해 이번 주부터 발표 준비를 병행하는 것을 추천합니다.</div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800"><div className="font-semibold mb-1">✅ 잘 되고 있는 점</div>회의록 업로드 후 AI 자동 분석이 2건 완료되었습니다. To-Do 자동 생성 활용도가 높습니다.</div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="text-sm font-semibold text-foreground mb-3">팀원별 활동량</div>
            {MEMBERS.map(m => {
              const cnt = ACTIVITY_LOG.filter(a => a.actor === m.name).length;
              const maxCnt = 8;
              return (
                <div key={m.id} className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: m.color }}>{m.initials}</div>
                  <div className="flex-1 h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${(cnt / maxCnt) * 100}%`, background: m.color }} /></div>
                  <span className="text-xs text-muted-foreground w-6 text-right">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── auth & onboarding ───────────────────────────────────────────────────────
