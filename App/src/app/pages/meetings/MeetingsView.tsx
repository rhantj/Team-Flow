import { useState, useEffect } from "react";
import { CatTag } from "../../components/common/CatTag";
import { PriorityBadge } from "../../components/common/PriorityBadge";
import { getCat } from "../../services/taskService";
import { MEMBERS } from "../../data/members";
import {
  MEETINGS, GEN_TODOS, ANALYZE_STAGES, MOCK_SUMMARY, MOCK_DECISIONS, MOCK_RISKS,
} from "../../data/meetings";
import type { UploadFlow, UploadType, GenTodo } from "../../models/meeting";
import {
  LayoutDashboard,
  Columns3,
  FileAudio,
  Sparkles,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Calendar,
  Upload,
  Circle,
  CheckCheck,
  FileText,
  Mic,
  Eye,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  Check,
  Users,
  Film,
  ListChecks,
  Radio,
} from "lucide-react";

export function MeetingsView() {
  const [selected, setSelected] = useState<string|null>("m1");
  const [uploadFlow, setUploadFlow] = useState<UploadFlow>(null);
  const [uploadType, setUploadType] = useState<UploadType>(null);
  const [modalStep, setModalStep] = useState(0);
  const [analyzeStage, setAnalyzeStage] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [meetTitle, setMeetTitle] = useState("7차 정기 회의 — 결제 연동 최종 점검");
  const [meetDate, setMeetDate] = useState("2024-12-17");
  const [meetKind, setMeetKind] = useState("정기회의");
  const [partIds, setPartIds] = useState<string[]>(["1","2","3","4"]);
  const [selTodos, setSelTodos] = useState<string[]>(GEN_TODOS.map(t => t.id));
  const [todoAssignees, setTodoAssignees] = useState<Record<string,string>>({});
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [panelTab, setPanelTab] = useState<"summary"|"todos"|"risks">("summary");

  // Simulate analysis progress
  useEffect(() => {
    if (uploadFlow !== "analyzing") return;
    let prog = 0; let stg = 0;
    const iv = setInterval(() => {
      prog = Math.min(prog + 1.5, 100);
      stg = Math.min(Math.floor(prog / (100 / ANALYZE_STAGES.length)), ANALYZE_STAGES.length - 1);
      setAnalyzeStage(stg); setAnalyzeProgress(Math.round(prog));
      if (prog >= 100) { clearInterval(iv); setTimeout(() => { setUploadFlow("results"); setPanelTab("summary"); }, 600); }
    }, 70);
    return () => clearInterval(iv);
  }, [uploadFlow]);

  const meeting = MEETINGS.find(m => m.id === selected);

  // ── Upload type metadata ─────────────────────────────────────────────────────
  const UPLOAD_TYPES = [
    { id:"document", label:"문서 업로드", desc:"PDF, Word, TXT, HWP 등 회의록 문서", icon:FileText, accept:".pdf,.doc,.docx,.txt,.hwp", color:"#3B5BDB", bg:"rgba(59,91,219,0.1)", note:"텍스트를 추출해 AI가 분석합니다." },
    { id:"audio",    label:"음성파일 업로드", desc:"mp3, wav, m4a 등 녹음파일", icon:Radio,    accept:".mp3,.wav,.m4a,.ogg", color:"#7048E8", bg:"rgba(112,72,232,0.1)", note:"음성을 텍스트로 변환한 뒤 분석합니다." },
    { id:"video",    label:"영상파일 업로드", desc:"mp4, mov, Zoom/Discord 녹화본", icon:Film,  accept:".mp4,.mov,.avi,.webm", color:"#10B981", bg:"rgba(16,185,129,0.1)", note:"음성 트랙을 추출해 분석합니다." },
  ] as const;

  const MEET_KINDS = ["정기회의","중간점검","발표준비","개발회의","기타"];

  const getAssignee = (todo: GenTodo): string => todoAssignees[todo.id] ?? todo.assignee;
  const displayedTodos = showUnassigned ? GEN_TODOS.filter(t => !getAssignee(t)) : GEN_TODOS;

  // ── Analyzing screen ────────────────────────────────────────────────────────
  const renderAnalyzing = () => (
    <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      <div className="w-full max-w-lg px-6 text-center">
        {/* Spinner */}
        <div className="relative w-28 h-28 mx-auto mb-8">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="48" fill="none" stroke="#EEF1F8" strokeWidth="8" />
            <circle cx="56" cy="56" r="48" fill="none" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(analyzeProgress / 100) * 301} 301`} stroke="url(#ag)" />
            <defs><linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7048E8" /><stop offset="100%" stopColor="#4F6EF7" />
            </linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{analyzeProgress}%</span>
            <span className="text-[10px] text-muted-foreground">분석 중</span>
          </div>
        </div>

        <div className="mb-2 text-xs font-mono text-muted-foreground">{uploadFileName || "회의록_7차.pdf"}</div>
        <h2 className="text-xl font-bold text-foreground mb-1">AI 분석 진행 중</h2>
        <p className="text-sm text-muted-foreground mb-8">잠시만 기다려주세요. 회의 내용을 분석하고 업무를 자동 생성합니다.</p>

        {/* Stage list */}
        <div className="space-y-2 text-left max-w-sm mx-auto">
          {ANALYZE_STAGES.map((stage, i) => {
            const done = i < analyzeStage; const active = i === analyzeStage;
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${active ? "bg-blue-50 border border-blue-200" : done ? "opacity-60" : "opacity-30"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : active ? "border-2 border-blue-500" : "border-2 border-slate-300"}`}>
                  {done ? <Check className="w-3 h-3 text-white" /> : active ? <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> : null}
                </div>
                <span className={`text-xs font-medium ${active ? "text-blue-700" : done ? "text-emerald-700" : "text-muted-foreground"}`}>{stage}</span>
                {active && <div className="ml-auto flex gap-0.5">{[0,1,2].map(j => <div key={j} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay:`${j*0.15}s` }} />)}</div>}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-8">약 20~40초 소요 · 분석이 완료되면 자동으로 이동합니다</p>
      </div>
    </div>
  );

  // ── Results screen ───────────────────────────────────────────────────────────
  const renderResults = () => (
    <div className="h-full flex overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      {/* Left: meeting list (mini) */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600">AI 분석 완료</span>
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">{meetTitle}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{meetDate} · {meetKind}</div>
          <div className="flex -space-x-1.5 mt-2">
            {partIds.map(id => { const m = MEMBERS.find(me => me.id === id)!; return (
              <div key={id} title={m.name} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold" style={{ background:m.color }}>{m.initials}</div>
            ); })}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["summary","todos","risks"] as const).map(tab => {
            const l = { summary:"요약", todos:"To-Do", risks:"위험" };
            return <button key={tab} onClick={() => setPanelTab(tab)} className={`flex-1 py-2.5 text-[11px] font-semibold border-b-2 transition-colors ${panelTab===tab ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l[tab]}</button>;
          })}
        </div>
        {/* Quick info */}
        <div className="p-4 space-y-2 text-xs text-muted-foreground border-b border-border">
          <div className="flex justify-between"><span>업로드 유형</span><span className="font-medium text-foreground">{UPLOAD_TYPES.find(u => u.id === uploadType)?.label ?? "문서 업로드"}</span></div>
          <div className="flex justify-between"><span>생성된 To-Do</span><span className="font-semibold text-blue-600">{GEN_TODOS.length}개</span></div>
          <div className="flex justify-between"><span>미배정 업무</span><span className="font-semibold text-amber-600">{GEN_TODOS.filter(t => !t.assignee).length}개</span></div>
          <div className="flex justify-between"><span>위험 요소</span><span className="font-semibold text-red-600">{MOCK_RISKS.length}건</span></div>
        </div>
        {/* Actions */}
        <div className="p-4 space-y-2">
          <button onClick={() => setUploadFlow("review")}
            className="w-full py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
            <ListChecks className="w-4 h-4" />역할 분배 검토 →
          </button>
          <button className="w-full py-2 text-xs font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />회의록 저장
          </button>
          <button onClick={() => setUploadFlow(null)} className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            닫기
          </button>
        </div>
      </div>

      {/* Right: results */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ AI 분석 완료</span>
              <span className="text-[10px] text-muted-foreground">{meetDate}</span>
            </div>
            <h1 className="text-lg font-bold text-foreground">{meetTitle}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{meetKind} · 참석자 {partIds.length}명</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card rounded-lg hover:bg-muted transition-colors"><Eye className="w-3.5 h-3.5" />원본 보기</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />PDF 저장</button>
          </div>
        </div>

        {/* Summary tab */}
        {panelTab === "summary" && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color:"var(--accent)" }} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI 회의 요약</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{MOCK_SUMMARY}</p>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CheckCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">핵심 결정사항</span>
              </div>
              <ul className="space-y-2.5">
                {MOCK_DECISIONS.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-emerald-600">{i + 1}</div>
                    <span className="text-sm text-foreground leading-relaxed">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">다음 회의 전까지</div>
              <ul className="space-y-1.5">
                {["SDK 교체 완료 및 테스트 결과 공유", "AI 모델 80 epoch 학습 결과 리포트", "발표 대본 1차 초안 팀 채널 공유"].map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Todos tab */}
        {panelTab === "todos" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">생성된 To-Do <span className="text-muted-foreground font-normal">({GEN_TODOS.length}개)</span></div>
              <button onClick={() => setUploadFlow("review")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90"
                style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                <ListChecks className="w-3.5 h-3.5" />역할 분배 검토
              </button>
            </div>
            {GEN_TODOS.map(todo => {
              const cat = getCat(todo.category);
              const m = MEMBERS.find(me => me.id === todo.assignee);
              return (
                <div key={todo.id} className={`bg-card rounded-xl p-4 border shadow-sm ${!todo.assigned ? "border-amber-300" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CatTag catId={todo.category} />
                      {!todo.assigned && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">미배정</span>}
                    </div>
                    <PriorityBadge priority={todo.priority} />
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1">{todo.title}</div>
                  <div className="text-xs text-muted-foreground mb-2">{todo.desc}</div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {m ? (
                        <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background:m.color }}>{m.initials}</div><span className="text-muted-foreground">{m.name}</span></div>
                      ) : <span className="text-amber-600 font-medium">담당자 미배정</span>}
                    </div>
                    <span className="text-muted-foreground">마감 {todo.dueDate}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                    근거: <span className="text-foreground">{todo.basis}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Risks tab */}
        {panelTab === "risks" && (
          <div className="space-y-4">
            {MOCK_RISKS.map((r, i) => (
              <div key={i} className={`rounded-xl p-5 border ${r.level==="high" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${r.level==="high" ? "text-red-500" : "text-amber-500"}`} />
                  <div>
                    <span className={`text-[10px] font-bold mr-2 ${r.level==="high" ? "text-red-700" : "text-amber-700"}`}>{r.level==="high"?"🔴 즉시 대응":"🟡 주의"}</span>
                    <span className={`text-sm font-semibold ${r.level==="high" ? "text-red-900" : "text-amber-900"}`}>{r.text}</span>
                  </div>
                </div>
                <div className={`flex items-start gap-1.5 text-xs mt-2 ${r.level==="high" ? "text-red-700" : "text-amber-700"}`}>
                  <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                  <span><strong>AI 추천 대응:</strong> {r.suggestion}</span>
                </div>
              </div>
            ))}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-1"><Sparkles className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-semibold text-blue-700">AI 종합 제안</span></div>
              <p className="text-xs text-blue-800 leading-relaxed">결제 연동 이슈를 최우선 해결하고, AI 모델 목표를 단계적으로 설정하는 것이 현실적입니다. QA 일정은 결제 완료 후 집중 진행으로 조정을 권장합니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Review screen ────────────────────────────────────────────────────────────
  const renderReview = () => {
    const todos = showUnassigned ? GEN_TODOS.filter(t => !getAssignee(t)) : GEN_TODOS;
    const selCount = selTodos.filter(id => todos.find(t => t.id === id)).length;
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between mb-3">
            <div>
              <button onClick={() => setUploadFlow("results")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors group">
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />분석 결과로 돌아가기
              </button>
              <h1 className="text-xl font-bold text-foreground">역할 분배 검토</h1>
              <p className="text-sm text-muted-foreground mt-0.5">팀장이 확인하고 승인한 업무만 업무 보드에 등록됩니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowUnassigned(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${showUnassigned ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                <AlertTriangle className="w-3.5 h-3.5" />미배정만 보기 {showUnassigned && <span className="bg-amber-200 text-amber-800 px-1 rounded text-[10px]">{GEN_TODOS.filter(t=>!getAssignee(t)).length}</span>}
              </button>
              <button onClick={() => setUploadFlow("done")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                <CheckCircle2 className="w-4 h-4" />{selCount}개 업무 보드에 등록
              </button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">{GEN_TODOS.length}개 AI 생성</span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">{GEN_TODOS.filter(t=>t.assigned).length}개 배정 완료</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{GEN_TODOS.filter(t=>!getAssignee(t)).length}개 미배정</span>
            <button onClick={() => setSelTodos(GEN_TODOS.map(t=>t.id))} className="ml-auto text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2">전체 선택</button>
            <button onClick={() => setSelTodos([])} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">전체 해제</button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="pl-4 pr-2 py-3 w-8" />
                  {["ID","업무명","카테고리","담당자","마감일","우선순위","근거"].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {todos.map(todo => {
                  const checked = selTodos.includes(todo.id);
                  const assigneeId = getAssignee(todo);
                  const assigneeMember = MEMBERS.find(m => m.id === assigneeId);
                  const isUnassigned = !assigneeId;
                  return (
                    <tr key={todo.id} className={`hover:bg-muted/30 transition-colors ${isUnassigned ? "bg-amber-50/30" : ""}`}>
                      <td className="pl-4 pr-2 py-3">
                        <div onClick={() => setSelTodos(p => checked ? p.filter(x=>x!==todo.id) : [...p,todo.id])}
                          className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-all ${checked ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{todo.id}</td>
                      <td className="px-3 py-3 max-w-[180px]">
                        <div className="text-xs font-semibold text-foreground">{todo.title}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{todo.desc}</div>
                      </td>
                      <td className="px-3 py-3"><CatTag catId={todo.category} /></td>
                      <td className="px-3 py-3">
                        <select value={assigneeId} onChange={e => setTodoAssignees(p => ({ ...p, [todo.id]: e.target.value }))}
                          className={`text-xs rounded-lg border px-2 py-1.5 outline-none focus:border-blue-400 cursor-pointer ${isUnassigned ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-card text-foreground"}`}>
                          <option value="">⚠ 미배정</option>
                          {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input type="text" defaultValue={todo.dueDate} className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 outline-none focus:border-blue-400 w-16 text-center" />
                      </td>
                      <td className="px-3 py-3"><PriorityBadge priority={todo.priority} /></td>
                      <td className="px-3 py-3 text-[10px] text-muted-foreground max-w-[120px] truncate" title={todo.basis}>{todo.basis}</td>
                      <td className="px-3 py-3">
                        <button className="p-1 hover:bg-muted rounded transition-colors"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add task */}
          <button className="mt-3 flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-xl hover:bg-blue-50 transition-colors">
            <Plus className="w-3.5 h-3.5" />새 업무 직접 추가
          </button>
        </div>
      </div>
    );
  };

  // ── Done screen ──────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">업무 등록 완료!</h1>
        <p className="text-sm text-muted-foreground mb-2">{selTodos.length}개 업무가 업무 보드에 등록되었습니다.</p>
        <p className="text-xs text-muted-foreground mb-8">담당자별 할 일, 마일스톤 진행률, 대시보드가 자동으로 업데이트됩니다.</p>

        {/* Where registered */}
        <div className="grid grid-cols-2 gap-3 text-left mb-8">
          {[
            { icon:Columns3, label:"업무 보드", desc:"'할 일' 컬럼에 추가됨", color:"#3B5BDB" },
            { icon:Users, label:"담당자 할 일", desc:"개인 업무 목록에 반영", color:"#7048E8" },
            { icon:LayoutDashboard, label:"대시보드", desc:"전체 업무 수 업데이트", color:"#10B981" },
            { icon:Calendar, label:"캘린더", desc:"마감일 기반 일정 등록", color:"#F59E0B" },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border shadow-sm">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background:`${item.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color:item.color }} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
            회의록으로 돌아가기
          </button>
          <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
            업무 보드 확인하기
          </button>
        </div>
      </div>
    </div>
  );

  // ── Early returns for full-screen states ─────────────────────────────────────
  if (uploadFlow === "analyzing") return renderAnalyzing();
  if (uploadFlow === "results")   return renderResults();
  if (uploadFlow === "review")    return renderReview();
  if (uploadFlow === "done")      return renderDone();

  return (
    <div className="flex h-full overflow-hidden relative" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      {/* ── Upload modal ── */}
      {uploadFlow === "modal" && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setUploadFlow(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <div className="text-lg font-bold text-foreground">회의록 업로드</div>
                  <div className="text-xs text-muted-foreground mt-0.5">회의 파일을 업로드하면 AI가 자동으로 분석하고 업무를 생성합니다.</div>
                </div>
                <button onClick={() => setUploadFlow(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Step 0: type selection */}
                {modalStep === 0 && (
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-3">업로드 유형 선택</div>
                    <div className="grid grid-cols-3 gap-3">
                      {UPLOAD_TYPES.map(t => {
                        const Icon = t.icon; const sel = uploadType === t.id;
                        return (
                          <button key={t.id} onClick={() => setUploadType(t.id as UploadType)}
                            className={`flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 transition-all hover:shadow-sm ${sel ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                            style={sel ? { borderColor:t.color, background:t.bg } : {}}>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background:sel ? t.bg : "#F4F6FA" }}>
                              <Icon className="w-6 h-6" style={{ color:t.color }} />
                            </div>
                            <div className="text-center">
                              <div className="text-sm font-bold text-foreground">{t.label}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</div>
                            </div>
                            {sel && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background:t.color }}><Check className="w-3 h-3 text-white" /></div>}
                          </button>
                        );
                      })}
                    </div>
                    {uploadType && (
                      <div className="mt-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        {UPLOAD_TYPES.find(t => t.id === uploadType)?.note}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: form + file upload */}
                {modalStep === 1 && uploadType && (() => {
                  const utype = UPLOAD_TYPES.find(t => t.id === uploadType)!;
                  const Icon = utype.icon;
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:utype.bg }}><Icon className="w-4 h-4" style={{ color:utype.color }} /></div>
                        <span className="text-sm font-bold text-foreground">{utype.label}</span>
                      </div>

                      {/* File drop zone */}
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
                        onClick={() => setUploadFileName(utype.id === "document" ? "회의록_7차.pdf" : utype.id === "audio" ? "7차회의_녹음.m4a" : "7차회의_zoom.mp4")}>
                        {uploadFileName ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background:utype.bg }}><Icon className="w-6 h-6" style={{ color:utype.color }} /></div>
                            <div className="text-sm font-semibold text-foreground">{uploadFileName}</div>
                            <div className="text-[10px] text-muted-foreground">{utype.id==="document"?"245 KB":utype.id==="audio"?"18.2 MB":"127 MB"}</div>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">업로드 완료</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <div className="text-sm font-medium text-foreground">파일을 드래그하거나 클릭하여 업로드</div>
                            <div className="text-xs text-muted-foreground">{utype.accept.toUpperCase().replace(/\./g,'').replace(/,/g,', ')} 지원</div>
                          </div>
                        )}
                      </div>

                      {/* Metadata form */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 제목 <span className="text-red-500">*</span></label>
                          <input value={meetTitle} onChange={e => setMeetTitle(e.target.value)} placeholder="예: 7차 정기 회의 — 결제 연동 점검"
                            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 날짜</label>
                          <input type="date" value={meetDate} onChange={e => setMeetDate(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 유형</label>
                          <select value={meetKind} onChange={e => setMeetKind(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            {MEET_KINDS.map(k => <option key={k}>{k}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Participants */}
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-2">참석자</label>
                        <div className="flex flex-wrap gap-2">
                          {MEMBERS.map(m => {
                            const sel = partIds.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => setPartIds(p => sel ? p.filter(x=>x!==m.id) : [...p,m.id])}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${sel ? "border-blue-400 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                                <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background:m.color }}>{m.initials}</div>
                                {m.name}
                                {sel && <Check className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Auto analyze toggle */}
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border">
                        <div>
                          <div className="text-xs font-semibold text-foreground">자동 분석 시작</div>
                          <div className="text-[10px] text-muted-foreground">업로드 후 즉시 AI 분석을 시작합니다.</div>
                        </div>
                        <div className="w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer" style={{ background:"var(--primary)" }}>
                          <div className="w-5 h-5 rounded-full bg-white shadow-sm ml-auto" />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <button onClick={() => modalStep===0 ? setUploadFlow(null) : setModalStep(0)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors">
                  <ArrowLeft className="w-4 h-4" />{modalStep===0?"취소":"이전"}
                </button>
                {modalStep === 0 ? (
                  <button onClick={() => setModalStep(1)} disabled={!uploadType}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                    다음<ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => { setUploadFlow("analyzing"); setAnalyzeStage(0); setAnalyzeProgress(0); }}
                    disabled={!uploadFileName}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                    <Sparkles className="w-4 h-4" />AI 분석 시작
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Meeting list ── */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); }}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background:"linear-gradient(135deg,#7048E8 0%,#4F6EF7 100%)" }}>
            <Upload className="w-4 h-4" />회의록 업로드
          </button>
          <button className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
            <Mic className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {MEETINGS.map(m => (
            <button key={m.id} onClick={() => setSelected(m.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selected === m.id ? "border-blue-300 bg-blue-50" : "border-border bg-card hover:bg-muted"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{m.date}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.status === "processed" ? "bg-emerald-100 text-emerald-600" : m.status === "processing" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                  {m.status === "processed" ? "AI 분석 완료" : m.status === "processing" ? "분석 중" : "예정"}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground leading-snug">{m.title}</div>
              {m.duration !== "—" && <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{m.duration}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {meeting && meeting.summary ? (
          <div className="max-w-2xl space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>AI 회의록 분석</span>
              </div>
              <h2 className="text-lg font-bold text-foreground">{meeting.title}</h2>
              <div className="text-xs text-muted-foreground mt-0.5">{meeting.date} · {meeting.duration}</div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">회의 요약</div>
              <p className="text-sm text-foreground leading-relaxed">{meeting.summary}</p>
            </div>

            {meeting.decisions && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCheck className="w-4 h-4 text-emerald-500" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">핵심 결정사항</div>
                </div>
                <ul className="space-y-2">
                  {meeting.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.todos && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">생성된 To-Do</div>
                  </div>
                  <button className="text-xs font-medium text-blue-600 hover:text-blue-700">업무로 등록</button>
                </div>
                <ul className="space-y-2">
                  {meeting.todos.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.risks && (
              <div className="rounded-xl p-5 border border-amber-200 bg-amber-50">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">위험 요소</div>
                </div>
                <ul className="space-y-2">
                  {meeting.risks.map((r, i) => (
                    <li key={i} className="text-sm text-amber-800">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : meeting ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
            <Clock className="w-12 h-12 text-muted" />
            <div className="text-sm font-medium">
              {meeting.status === "pending" ? "예정된 회의입니다" : "AI 분석이 준비되지 않았습니다"}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FileAudio className="w-12 h-12 text-muted" />
            <div className="text-sm font-medium">회의록을 선택하세요</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── deliverables (redesigned) ────────────────────────────────────────────────
