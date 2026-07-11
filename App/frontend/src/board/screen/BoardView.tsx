import { useState } from "react";
import { CatTag } from "../components/CatTag";
import { TaskStatusPill } from "../components/TaskStatusPill";
import { PriorityBadge } from "../components/PriorityBadge";
import { LabelBadge } from "../../global/component/LabelBadge";
import { getCat } from "../libs/utils/taskService";
import { CATEGORIES, TASK_CAT, CAT_EXTRA, BOARD_COLS } from "../libs/mock/tasks";
import { MEMBERS } from "../../global/lib/mock/members";
import { useStoredTasks } from "../../global/hooks/useStoredTasks";
import type { Priority, TaskStatus } from "../libs/types/task";
import {
  FileAudio,
  Sparkles,
  Bell,
  Plus,
  AlertTriangle,
  CheckCircle2,
  X,
  Send,
  GitCommit,
  GitPullRequest,
  CheckCheck,
  FileText,
  Eye,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  Check,
  User,
  AlertCircle,
  MessageSquare,
  RefreshCw,
  GitBranch,
} from "lucide-react";

export function BoardView() {
  const TASKS = useStoredTasks();
  const [selId, setSelId] = useState<string|null>(null);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(0);
  const [selCat, setSelCat] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAssignee, setFAssignee] = useState("1");
  const [fDue, setFDue] = useState("");
  const [fPriority, setFPriority] = useState<Priority>("medium");
  const [fStatus, setFStatus] = useState<TaskStatus>("todo");
  const [fCriteria, setFCriteria] = useState("");
  const [panelTab, setPanelTab] = useState<"info"|"cat"|"activity"|"ai">("info");
  const [newComment, setNewComment] = useState("");

  const selTask = selId ? TASKS.find(t => t.id === selId) : null;
  const taskCat = selTask ? (TASK_CAT[selTask.id] ?? "other") : "other";
  const catDef = getCat(taskCat);

  const openModal = (status: TaskStatus) => {
    setFStatus(status); setSelCat(""); setStep(0); setShowModal(true);
    setFTitle(""); setFDesc(""); setFDue(""); setFPriority("medium"); setFCriteria("");
  };

  // ── per-status action sets ──────────────────────────────────────────────────
  const STATUS_ACTIONS: Record<TaskStatus, { label: string; icon: any; primary?: boolean; danger?: boolean }[]> = {
    todo: [
      { label:"진행 중으로 이동", icon:ArrowRight, primary:true },
      { label:"담당자 변경", icon:User },
      { label:"체크리스트 생성", icon:CheckSquare },
      { label:"시작 알림", icon:Bell },
      { label:"AI 업무 세분화", icon:Sparkles },
    ],
    inprogress: [
      { label:"완료로 이동", icon:CheckCircle2, primary:true },
      { label:"블로커 등록", icon:AlertTriangle, danger:true },
      { label:"PR 연결", icon:GitPullRequest },
      { label:"진행상황 요청", icon:Bell },
      { label:"AI 지연 분석", icon:Sparkles },
    ],
    blocked: [
      { label:"블로커 해결 완료", icon:CheckCircle2, primary:true },
      { label:"긴급 알림", icon:Bell, danger:true },
      { label:"담당자 재배정", icon:User },
      { label:"AI 해결안 보기", icon:Sparkles },
      { label:"영향 업무 확인", icon:AlertCircle },
    ],
    done: [
      { label:"검수 완료", icon:CheckCheck, primary:true },
      { label:"팀장 피드백", icon:MessageSquare },
      { label:"결과물 보기", icon:Eye },
      { label:"AI 완료 요약", icon:Sparkles },
      { label:"다시 열기", icon:RefreshCw },
    ],
  };

  // ── category-specific modal fields (step 2) ─────────────────────────────────
  const CAT_MODAL_FIELDS: Record<string, [string, string][]> = {
    frontend:     [["화면 이름","구현할 화면명"],["컴포넌트","예: Header, SearchBar"],["연결 API","예: /api/v1/users"],["Figma 링크","https://figma.com/..."],["GitHub 브랜치","예: feature/user-list"]],
    backend:      [["API 이름","예: 사용자 로그인 API"],["Method","GET / POST / PUT / DELETE"],["Endpoint","예: /api/v1/auth/login"],["연결 DB 테이블","예: users, sessions"],["인증 필요 여부","필요 / 불필요"]],
    "ai-ml":      [["모델 목적","예: 주차 빈자리 예측"],["사용 데이터","예: 90일치 센서 데이터"],["모델 종류","예: Random Forest, LSTM"],["평가 지표","예: Accuracy, RMSE"],["목표 성능","예: Accuracy 90% 이상"]],
    data:         [["데이터 출처","예: CCTV 센서, 공공데이터"],["데이터 형식","예: CSV, JSON, 이미지"],["수집 목표량","예: 90일치 / 10만 건"],["전처리 방법","예: 결측치 제거, 정규화"]],
    db:           [["테이블명","예: users, spaces"],["ERD 상태","예: 설계 완료 / 수정 중"],["쿼리 이슈","예: 풀스캔 발생"],["인덱스 여부","적용 / 미적용"]],
    devops:       [["배포 환경","예: AWS EC2, Docker"],["배포 상태","예: 개발 서버 배포 완료"],["CI/CD 도구","예: GitHub Actions"]],
    github:       [["브랜치명","예: feature/payment-flow"],["PR 번호","예: PR #18"],["리뷰 상태","리뷰 대기 / 완료"],["충돌 여부","없음 / 있음"]],
    qa:           [["테스트 대상","예: 예약 API 전체"],["테스트 케이스","예: 정상 흐름, 경계값"],["기대 결과","예: 응답 2초 이내"],["테스트 방법","수동 / 자동 / 부하"]],
    security:     [["점검 대상","예: 로그인 API, 권한 검사"],["위험 수준","높음 / 중간 / 낮음"],["발견된 취약점","예: SQL Injection 가능성"],["조치 방법","예: Prepared Statement"]],
    docs:         [["문서 종류","예: README / 보고서 / 설명서"],["작성 범위","예: API 명세 전체"],["포함할 내용","예: 설치 방법, 주요 기능"]],
    presentation: [["발표 주제","예: AI 기반 스마트 주차"],["담당 파트","예: 기술 스택 소개 (3~6슬라이드)"],["PPT 페이지 수","예: 20슬라이드"],["시연 포함 여부","포함 / 미포함"]],
    deliverable:  [["산출물 종류","예: 최종 보고서, 제안서"],["제출 형식","예: PDF, DOCX"],["포함 항목","예: 목차, 결론, 부록"],["제출 마감","예: 12.28 23:59"]],
    operation:    [["제출처","예: 공모전 홈페이지, 교수 이메일"],["제출 파일","예: 보고서.pdf, 발표.pptx"],["마감 시간","예: 12.28 23:59"],["제출 상태","미제출 / 제출 완료"]],
    planning:     [["기획 목적","예: 핵심 기능 범위 확정"],["사용자 시나리오","예: 예약 → 결제 → 완료"],["연결된 기능","예: 예약 모듈, 결제 모듈"]],
    research:     [["조사 주제","예: 경쟁 서비스 벤치마킹"],["참고 자료","논문/기사 링크"],["핵심 인사이트","조사에서 발견한 핵심 내용"]],
    "ux-ui":      [["화면 이름","설계할 화면명"],["사용자 플로우","예: 로그인 → 예약 → 결제"],["Figma 링크","https://figma.com/..."]],
    design:       [["디자인 유형","예: PPT 디자인, 로고"],["색상/폰트 가이드","예: Primary #3B5BDB, Inter"],["참고 이미지","예: Dribbble 링크"]],
    other:        [["결과물","이 업무에서 생성할 파일이나 결과물"],["완료 기준 보완","추가 완료 기준"],["참고 자료","관련 링크 또는 파일"]],
  };

  // ── category-specific detail panel fields ───────────────────────────────────
  const getCatDetailFields = (taskId: string, cat: string): [string, string][] => {
    const e = CAT_EXTRA[taskId] ?? {};
    switch (cat) {
      case "frontend":     return [["화면",e.screen??"—"],["컴포넌트",e.components??"—"],["API",e.api??"—"],["Figma",e.figma??"—"],["반응형",e.responsive??"—"],["PR",e.pr??"—"]];
      case "backend":      return [["Method",e.method??"—"],["Endpoint",e.endpoint??"—"],["인증",e.auth??"—"],["연결 DB",e.db??"—"],["테스트",e.test??"—"]];
      case "ai-ml":        return [["목적",e.purpose??"—"],["데이터",e.data??"—"],["모델",e.model??"—"],["지표",e.metric??"—"],["현재 성능",e.result??"—"],["추론 API",e.inferenceAPI??"—"]];
      case "qa":           return [["대상",e.target??"—"],["케이스",e.cases??"—"],["기대",e.expected??"—"],["실제",e.actual??"—"],["버그",e.bug??"—"]];
      case "docs":         return [["종류",e.docType??"—"],["범위",e.scope??"—"],["포함",e.includes??"—"],["참고",e.ref??"—"]];
      case "presentation": return [["주제",e.topic??"—"],["페이지",e.pages??"—"],["시연",e.demo??"—"],["초안",e.draft??"—"],["대본",e.script??"—"]];
      case "db":           return [["테이블",e.table??"—"],["ERD",e.erd??"—"],["이슈",e.issue??"—"],["인덱스",e.index??"—"],["목표",e.goal??"—"]];
      case "security":     return [["대상",e.target??"—"],["위험",e.risk??"—"],["취약점",e.findings??"—"],["인증",e.auth??"—"],["조치",e.remediation??"—"]];
      default:             return [["카테고리",getCat(cat).label],["정보","업무 상세 참고"]];
    }
  };

  const catAIBtn: Record<string, string> = {
    frontend:"QA 요청",backend:"API 명세 작성","ai-ml":"실험 결과 기록",
    qa:"버그 등록",docs:"AI 문장 정리",presentation:"발표 대본 생성",db:"스키마 변경 기록",default:"AI 추천 받기",
  };

  return (
    <div className="h-full flex overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>

      {/* ── Kanban board ── */}
      <div className={`flex gap-4 p-5 overflow-x-auto transition-all ${selTask ? "flex-1 min-w-0" : "w-full"}`}>
        {BOARD_COLS.map(col => {
          const tasks = TASKS.filter(t => t.status === col.id);
          return (
            <div key={col.id} className="w-[272px] shrink-0 flex flex-col rounded-xl" style={{ background: col.bg }}>
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-sm font-semibold" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-[10px] font-mono bg-white rounded-full px-1.5 py-0.5 border border-border text-muted-foreground">{tasks.length}</span>
                </div>
                <button onClick={() => openModal(col.id)} className="hover:bg-white/60 rounded-md p-1 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Task cards */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-0">
                {tasks.map(task => {
                  const catId = TASK_CAT[task.id] ?? "other";
                  const m = MEMBERS.find(me => me.id === task.assignee)!;
                  const isSelected = selId === task.id;
                  const hasCode = ["frontend","backend","ai-ml","db","github","devops"].includes(catId);
                  return (
                    <div key={task.id}
                      onClick={() => { setSelId(task.id === selId ? null : task.id); setPanelTab("info"); }}
                      className={`bg-card rounded-xl p-3 border cursor-pointer transition-all hover:shadow-md ${isSelected ? "border-blue-400 shadow-md ring-1 ring-blue-200" : "border-border shadow-sm hover:border-slate-300"}`}>
                      {/* Cat tag + ID */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <CatTag catId={catId} />
                        <span className="font-mono text-[9px] text-muted-foreground">{task.id}</span>
                      </div>
                      {/* Title */}
                      <div className="text-[11px] font-semibold text-foreground mb-2.5 leading-snug">{task.title}</div>
                      {/* Priority + due + avatar */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          <PriorityBadge priority={task.priority} />
                          {task.status === "blocked" && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600">블로커</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{task.dueDate}</span>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>{m.initials}</div>
                        </div>
                      </div>
                      {/* Connection icons */}
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                        {hasCode && <GitCommit className="w-3 h-3 text-slate-300" />}
                        {hasCode && <GitPullRequest className="w-3 h-3 text-slate-300" />}
                        <FileAudio className="w-3 h-3 text-slate-300" />
                        {["docs","presentation","deliverable"].includes(catId) && <FileText className="w-3 h-3 text-slate-300" />}
                        <span className="text-[9px] text-muted-foreground ml-auto">{task.labels[0]}</span>
                      </div>
                    </div>
                  );
                })}
                {/* Add card button */}
                <button onClick={() => openModal(col.id)}
                  className="w-full py-2 text-[11px] font-medium text-muted-foreground border border-dashed border-border rounded-xl hover:bg-white/60 hover:border-slate-300 transition-all flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" />업무 추가
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detail panel ── */}
      {selTask && (() => {
        const m = MEMBERS.find(me => me.id === selTask.assignee)!;
        const actions = STATUS_ACTIONS[selTask.status] ?? [];
        const catFields = getCatDetailFields(selTask.id, taskCat);
        const aiBtn = catAIBtn[taskCat] ?? catAIBtn["default"];
        return (
          <div className="w-[370px] shrink-0 bg-card border-l border-border flex flex-col h-full overflow-hidden">
            {/* Panel header */}
            <div className="flex items-start gap-2 p-4 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <CatTag catId={taskCat} />
                  <TaskStatusPill status={selTask.status} />
                  <PriorityBadge priority={selTask.priority} />
                </div>
                <div className="text-sm font-bold text-foreground leading-snug">{selTask.title}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{selTask.id}</div>
              </div>
              <button onClick={() => setSelId(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Status actions */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">빠른 액션</div>
              <div className="flex flex-wrap gap-1.5">
                {actions.map(a => {
                  const Icon = a.icon;
                  const style = a.primary
                    ? { background: "linear-gradient(135deg,#3B5BDB,#4F6EF7)", color: "white" }
                    : a.danger
                    ? { background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA" }
                    : undefined;
                  return (
                    <button key={a.label}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all hover:opacity-90 ${!style ? "border border-border bg-card text-foreground hover:bg-muted" : ""}`}
                      style={style}>
                      <Icon className="w-3 h-3" />{a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["info","cat","activity","ai"] as const).map(tab => {
                const labels = { info:"기본 정보", cat:"카테고리", activity:"활동", ai:"AI 추천" };
                return (
                  <button key={tab} onClick={() => setPanelTab(tab)}
                    className={`flex-1 text-[11px] font-semibold py-2.5 border-b-2 transition-colors ${panelTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ─ info tab ─ */}
              {panelTab === "info" && (
                <>
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">담당 정보</div>
                    <div className="space-y-2">
                      {[
                        ["담당자", <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>{m.initials}</div><span className="text-xs font-medium text-foreground">{m.name}</span><span className="text-[10px] text-muted-foreground">({m.role})</span></div>],
                        ["마감일", <span className="text-xs font-semibold text-foreground">{selTask.dueDate} <span className="text-amber-600">D-8</span></span>],
                        ["마일스톤", <span className="text-xs font-medium text-blue-600 cursor-pointer hover:underline">M3: 핵심 기능 개발</span>],
                        ["생성",    <span className="text-xs text-muted-foreground">김민준 · 회의록 AI</span>],
                        ["최종 수정", <span className="text-xs text-muted-foreground">3시간 전</span>],
                      ].map(([label, value], i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-14 shrink-0">{label as string}</span>
                          <div className="flex-1">{value as React.ReactNode}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">레이블</div>
                    <div className="flex flex-wrap gap-1">{selTask.labels.map(l => <LabelBadge key={l} label={l} />)}</div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">완료 기준</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">담당자 자체 검수 후 팀장 최종 승인 시 완료 처리</p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">GitHub 연결</div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted border border-border">
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono text-foreground">feature/{selTask.id.toLowerCase()}</span>
                    </div>
                  </div>
                  {/* Checklist */}
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">체크리스트</div>
                    {[["설계 문서 확인",true],["구현 완료",selTask.status==="done"],["코드 리뷰 완료",selTask.status==="done"],["QA 통과",false]].map(([label, done]) => (
                      <div key={label as string} className="flex items-center gap-2 py-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${done ? "bg-emerald-500 border-emerald-500" : "border-border"}`}>
                          {done && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={`text-xs ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{label as string}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ─ cat tab ─ */}
              {panelTab === "cat" && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CatTag catId={taskCat} />
                    <span className="text-sm font-bold text-foreground">{catDef.label} 전용 정보</span>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 space-y-2.5 mb-3">
                    {catFields.map(([label, value]) => (
                      <div key={label} className="flex items-start gap-2">
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">{label}</span>
                        <span className="text-xs font-medium text-foreground flex-1 break-words leading-relaxed">{value}</span>
                      </div>
                    ))}
                  </div>
                  <button className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl border border-purple-200 hover:opacity-90 transition-opacity"
                    style={{ background:"rgba(112,72,232,0.08)", color:"#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" />{aiBtn}
                  </button>
                </div>
              )}

              {/* ─ activity tab ─ */}
              {panelTab === "activity" && (
                <div className="space-y-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">활동 기록</div>
                  {[
                    { actor:"김민준",  time:"3시간 전", msg:`상태를 '${selTask.status==="inprogress"?"진행 중":"완료"}'으로 변경`, type:"status" },
                    { actor:"회의록 AI", time:"어제",   msg:"6차 회의에서 이 업무가 자동 생성되었습니다.", type:"ai" },
                    { actor:"박지수",  time:"어제",     msg:"초안 검토 완료, 피드백 첨부했습니다.", type:"comment" },
                    { actor:"이서연",  time:"2일 전",   msg:"담당자를 '김민준'으로 변경했습니다.", type:"status" },
                  ].map((a, i) => {
                    const actorM = MEMBERS.find(me => me.name === a.actor);
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5"
                          style={{ background: a.type==="ai" ? "#7048E8" : actorM?.color ?? "#8892A4" }}>
                          {a.actor==="회의록 AI" ? "AI" : a.actor[0]}
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold text-foreground">{a.actor}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">{a.time}</span>
                          <div className="text-xs text-muted-foreground mt-0.5">{a.msg}</div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Comment input */}
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">코멘트 작성</div>
                    <div className="flex gap-2">
                      <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2}
                        placeholder="팀원에게 피드백이나 코멘트를 남기세요..."
                        className="flex-1 text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
                      <button onClick={() => setNewComment("")} className="self-end p-2 rounded-lg text-white shrink-0" style={{ background:"var(--primary)" }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─ AI tab ─ */}
              {panelTab === "ai" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border border-purple-200" style={{ background:"rgba(112,72,232,0.05)" }}>
                    <div className="flex items-center gap-1.5 mb-1.5"><Sparkles className="w-3.5 h-3.5" style={{ color:"#7048E8" }} /><span className="text-xs font-semibold text-foreground">AI 업무 요약</span></div>
                    <p className="text-xs text-muted-foreground leading-relaxed">이 업무는 핵심 기능 개발 마일스톤의 일부입니다. 현재 {selTask.status==="inprogress"?"진행 중":selTask.status==="blocked"?"블로커 상태":selTask.status==="done"?"완료":"대기 중"}이며 마감까지 8일 남았습니다.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="text-xs font-semibold text-blue-700 mb-1.5">💡 다음 액션 추천</div>
                    <ul className="text-xs text-blue-800 space-y-1 leading-relaxed">
                      <li>• {catDef.id==="frontend"?"Figma 설계를 먼저 확인하고 컴포넌트 구조를 설계하세요":catDef.id==="backend"?"API 명세를 먼저 작성하고 팀원과 공유하세요":catDef.id==="ai-ml"?"데이터 품질을 먼저 확인 후 모델 학습을 시작하세요":"담당자에게 현재 진행 상황을 요청하세요"}</li>
                      <li>• PR 생성 전 팀장에게 코드 리뷰 요청을 먼저 보내세요</li>
                    </ul>
                  </div>
                  {selTask.status !== "done" && (
                    <div className={`p-3 rounded-xl border ${selTask.status==="blocked"?"bg-red-50 border-red-200":"bg-amber-50 border-amber-200"}`}>
                      <div className={`text-xs font-semibold mb-1 ${selTask.status==="blocked"?"text-red-700":"text-amber-700"}`}>{selTask.status==="blocked"?"🚨 블로커 위험":"⚠ 지연 위험 분석"}</div>
                      <p className={`text-xs leading-relaxed ${selTask.status==="blocked"?"text-red-800":"text-amber-800"}`}>
                        {selTask.status==="blocked"?"현재 블로커 상태로 연결 업무에 지연이 발생할 수 있습니다. 오늘 내 해결이 필요합니다.":"현재 속도 기준 정상 진행 중입니다. 마감 전에 완료될 가능성이 높습니다."}
                      </p>
                    </div>
                  )}
                  <button className="w-full py-2.5 text-xs font-semibold rounded-xl border border-purple-200 flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                    style={{ background:"rgba(112,72,232,0.1)", color:"#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" />체크리스트 자동 생성
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Add task modal ── */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowModal(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>

              {/* Stepper header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3 overflow-x-auto">
                  {["카테고리 선택","기본 정보","추가 정보","생성 완료"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 shrink-0">
                      {i > 0 && <div className={`w-8 h-0.5 rounded ${i <= step ? "bg-blue-400" : "bg-border"}`} />}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? "bg-emerald-500 text-white" : i === step ? "text-white" : "bg-muted text-muted-foreground"}`}
                        style={i === step ? { background:"var(--primary)" } : {}}>
                        {i < step ? "✓" : i + 1}
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap ${i === step ? "text-foreground" : i < step ? "text-emerald-600" : "text-muted-foreground"}`}>{s}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors ml-4 shrink-0"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* Step 0: Category */}
                {step === 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-foreground mb-0.5">카테고리를 선택하세요</h2>
                    <p className="text-sm text-muted-foreground mb-4">업무 유형에 맞는 카테고리를 선택하면 관련 입력 항목이 자동으로 구성됩니다.</p>
                    <div className="grid grid-cols-3 gap-2">
                      {CATEGORIES.map(cat => {
                        const Icon = cat.icon; const sel = selCat === cat.id;
                        return (
                          <button key={cat.id} onClick={() => setSelCat(cat.id)}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm ${sel ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                            style={sel ? { borderColor:cat.color, background:cat.bg } : {}}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background:sel ? cat.bg : "#F4F6FA" }}>
                              <Icon className="w-4 h-4" style={{ color:cat.color }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-foreground leading-tight">{cat.label}</div>
                              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{cat.desc}</div>
                            </div>
                            {sel && <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background:cat.color }}><Check className="w-2.5 h-2.5 text-white" /></div>}
                          </button>
                        );
                      })}
                    </div>
                    {selCat === "other" && (
                      <div className="mt-3">
                        <input value={customCat} onChange={e => setCustomCat(e.target.value)} placeholder="카테고리명을 직접 입력하세요 (예: 하드웨어, 영상 편집)"
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: Common fields */}
                {step === 1 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4"><CatTag catId={selCat} /><h2 className="text-lg font-bold text-foreground">기본 업무 정보</h2></div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">업무명 <span className="text-red-500">*</span></label>
                        <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder={`${getCat(selCat).label} 관련 업무명`}
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">업무 설명</label>
                        <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={3} placeholder="업무의 목적과 범위를 간략히 설명하세요"
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">담당자</label>
                          <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">마감일</label>
                          <input type="date" value={fDue} onChange={e => setFDue(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">우선순위</label>
                          <div className="flex gap-1.5">
                            {(["low","medium","high"] as Priority[]).map(p => (
                              <button key={p} onClick={() => setFPriority(p)}
                                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${fPriority===p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                                {p==="low"?"낮음":p==="medium"?"중간":"높음"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">초기 상태</label>
                          <select value={fStatus} onChange={e => setFStatus(e.target.value as TaskStatus)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            <option value="todo">할 일</option><option value="inprogress">진행 중</option><option value="blocked">보류/블로커</option><option value="done">완료</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">완료 기준</label>
                        <input value={fCriteria} onChange={e => setFCriteria(e.target.value)} placeholder="이 업무가 완료로 볼 수 있는 기준을 입력하세요"
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Category-specific */}
                {step === 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4"><CatTag catId={selCat} /><h2 className="text-lg font-bold text-foreground">카테고리 전용 정보</h2></div>
                    <div className="space-y-4">
                      {(CAT_MODAL_FIELDS[selCat] ?? CAT_MODAL_FIELDS["other"]).map(([label, placeholder]) => (
                        <div key={label}>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">{label}</label>
                          <input placeholder={placeholder} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 p-3.5 rounded-xl border border-purple-200 flex items-center justify-between" style={{ background:"rgba(112,72,232,0.05)" }}>
                      <div className="text-xs text-purple-800"><span className="font-semibold">AI 추천:</span> 체크리스트와 완료 기준을 자동으로 생성해드릴 수 있어요.</div>
                      <button className="text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ background:"rgba(112,72,232,0.15)", color:"#7048E8" }}><Sparkles className="w-3 h-3" />자동 생성</button>
                    </div>
                  </div>
                )}

                {/* Step 3: Done */}
                {step === 3 && (
                  <div className="flex flex-col items-center text-center py-10">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-xl font-bold text-foreground mb-2">업무가 생성되었습니다!</div>
                    <p className="text-sm text-muted-foreground mb-2"><CatTag catId={selCat} /> 카테고리로 등록되었습니다.</p>
                    <p className="text-sm font-semibold text-foreground mb-6">"{fTitle || "새 업무"}"</p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">보드로 돌아가기</button>
                      <button onClick={() => { setStep(0); setSelCat(""); setFTitle(""); setFDesc(""); setFCriteria(""); }}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"var(--primary)" }}>+ 업무 더 추가</button>
                    </div>
                  </div>
                )}

              </div>

              {/* Modal footer */}
              {step < 3 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <button onClick={() => step===0 ? setShowModal(false) : setStep(step-1)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors">
                    <ArrowLeft className="w-4 h-4" />{step===0?"취소":"이전"}
                  </button>
                  <button onClick={() => setStep(step+1)} disabled={step===0 && !selCat}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                    {step===2?"업무 생성 완료":"다음 단계"}<ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
