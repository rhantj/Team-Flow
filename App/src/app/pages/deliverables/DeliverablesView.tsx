import { useState } from "react";
import { MEMBERS } from "../../data/members";
import {
  DELIV_CATS, DELIV_CAT_ICONS, DELIV_CAT_COLORS,
  DELIV_CARDS, STATUS_META, DATA_SOURCES, FILE_FORMATS, TONE_OPTIONS,
} from "../../data/deliverables";
import {
  Sparkles,
  Search,
  Plus,
  X,
  Send,
  FileText,
  MoreHorizontal,
  Link2,
  Eye,
  Check,
  Download,
  Pencil,
  Globe,
} from "lucide-react";

export function DeliverablesView() {
  const [activeCat, setActiveCat] = useState("발표자료");
  const [selCard, setSelCard] = useState<string|null>(null);
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [selSources, setSelSources] = useState<string[]>(["회의록","To-Do","업무 보드"]);
  const [selTone, setSelTone] = useState("공식적");
  const [selFormat, setSelFormat] = useState("PDF");
  const [delivTitle, setDelivTitle] = useState("");
  const [panelTab, setPanelTab] = useState<"info"|"preview"|"versions">("info");
  const [aiComment, setAiComment] = useState("");

  // Category-specific form state
  const [presType, setPresType] = useState("최종발표");
  const [presTime, setPresTime] = useState("15분");
  const [presSlides, setPresSlides] = useState("20");
  const [reportType, setReportType] = useState("최종보고");
  const [reportSections, setReportSections] = useState<string[]>(["개요","개발과정","주요기능","진행률","팀원역할"]);
  const [readmeSections, setReadmeSections] = useState<string[]>(["프로젝트 소개","핵심 기능","기술 스택","실행 방법","팀원 소개"]);
  const [proposalType, setProposalType] = useState("공모전");
  const [kptKeep, setKptKeep] = useState("");
  const [kptProb, setKptProb] = useState("");
  const [kptTry, setKptTry] = useState("");

  const selCardData = selCard ? DELIV_CARDS.find(d => d.id === selCard) : null;
  const filteredCards = DELIV_CARDS.filter(d => {
    const matchCat = d.type === activeCat || DELIV_CARDS.filter(x => x.type === activeCat).length === 0;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const toggleSource = (s: string) => setSelSources(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 1800);
  };

  // ── Category-specific form content ─────────────────────────────────────────
  const renderCatForm = () => {
    switch (activeCat) {
      case "발표자료": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">발표 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["중간발표","최종발표","데모"].map(t => (
                <button key={t} onClick={() => setPresType(t)} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${presType===t?"border-blue-500 bg-blue-50 text-blue-700":"border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">발표 시간</div>
            <select value={presTime} onChange={e => setPresTime(e.target.value)} className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400">
              {["5분","10분","15분","20분","30분"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">슬라이드 수</div>
            <input type="number" value={presSlides} onChange={e => setPresSlides(e.target.value)} min="5" max="50"
              className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">발표 대상</div>
            <input placeholder="예: 교수님, 심사위원, 기업 멘토" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">시연 여부</div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer" style={{ background:"var(--primary)" }}><div className="w-4 h-4 rounded-full bg-white shadow-sm ml-auto" /></div>
              <span className="text-xs text-foreground">시연 포함</span>
            </div>
          </div>
        </div>
      );

      case "보고서": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">보고서 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["중간보고","최종보고","진행보고"].map(t => (
                <button key={t} onClick={() => setReportType(t)} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${reportType===t?"border-blue-500 bg-blue-50 text-blue-700":"border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">제출 대상</div>
            <input placeholder="예: 담당 교수님, 지도교사" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">포함 섹션</div>
            {["개요","개발과정","주요기능","진행률","팀원역할","향후계획","문제해결"].map(s => (
              <label key={s} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <div onClick={() => setReportSections(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s])}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${reportSections.includes(s)?"border-blue-500 bg-blue-500":"border-border"}`}>
                  {reportSections.includes(s) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-xs text-foreground">{s}</span>
              </label>
            ))}
          </div>
        </div>
      );

      case "README": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">GitHub 저장소</div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-foreground flex-1 truncate">team-smartparking/smart-parking</span>
              <span className="text-[10px] text-emerald-600 font-medium">연결됨</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">포함할 섹션</div>
            {["프로젝트 소개","핵심 기능","기술 스택","실행 방법","폴더 구조","API 정보","팀원 소개","배포 링크"].map(s => (
              <label key={s} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <div onClick={() => setReadmeSections(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s])}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${readmeSections.includes(s)?"border-blue-500 bg-blue-500":"border-border"}`}>
                  {readmeSections.includes(s) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-xs text-foreground">{s}</span>
              </label>
            ))}
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">배지 추가</div>
            <div className="flex flex-wrap gap-1.5">
              {["License","Stars","Contributors","Build"].map(b => (
                <span key={b} className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border cursor-pointer hover:border-blue-400 transition-colors">{b}</span>
              ))}
            </div>
          </div>
        </div>
      );

      case "제안서": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">제안서 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["공모전","해커톤","캡스톤","기타"].map(t => (
                <button key={t} onClick={() => setProposalType(t)} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${proposalType===t?"border-amber-500 bg-amber-50 text-amber-700":"border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">문제 정의</div>
            <textarea rows={2} placeholder="해결하려는 문제를 간략히 설명하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">해결 방안</div>
            <textarea rows={2} placeholder="우리 서비스가 어떻게 문제를 해결하는지" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">차별성</div>
            <textarea rows={2} placeholder="경쟁 서비스 대비 차별화 포인트" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
      );

      case "실험 보고서": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">실험 목적</div>
            <input placeholder="예: 주차 빈자리 예측 정확도 향상" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">모델 종류</div>
            <input placeholder="예: Random Forest, LSTM, XGBoost" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">데이터셋</div>
            <input placeholder="예: CCTV 센서 90일 데이터, 10만 건" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">평가 지표</div>
            {["Accuracy","F1-Score","RMSE","MAE","AUC"].map(m => (
              <label key={m} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <div className="w-3.5 h-3.5 rounded border border-blue-500 bg-blue-500 flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>
                <span className="text-xs text-foreground">{m}</span>
              </label>
            ))}
          </div>
        </div>
      );

      case "회고": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">회고 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["팀 회고","개인 회고","스프린트 회고"].map(t => (
                <button key={t} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-blue-500 bg-blue-50 text-blue-700 first:block hidden first:inline-block">{t}</button>
              ))}
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-blue-500 bg-blue-50 text-blue-700">팀 회고</button>
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-slate-300">개인 회고</button>
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-slate-300">스프린트</button>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Keep — 잘한 점</span>
            </div>
            <textarea rows={2} value={kptKeep} onChange={e => setKptKeep(e.target.value)} placeholder="이번 주 잘한 것, 계속하면 좋을 것" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-emerald-400 resize-none" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Problem — 아쉬운 점</span>
            </div>
            <textarea rows={2} value={kptProb} onChange={e => setKptProb(e.target.value)} placeholder="이번 주 문제가 된 것, 개선이 필요한 것" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-red-400 resize-none" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Try — 개선할 점</span>
            </div>
            <textarea rows={2} value={kptTry} onChange={e => setKptTry(e.target.value)} placeholder="다음 주에 시도해볼 것" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
      );

      default: return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">산출물명</div>
            <input placeholder="산출물 이름을 직접 입력하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">산출물 설명</div>
            <textarea rows={2} placeholder="이 산출물의 목적을 설명하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">필요한 구성 항목</div>
            <textarea rows={2} placeholder="포함되어야 할 내용을 입력하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">완료 기준</div>
            <input placeholder="이 산출물의 완료 조건" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <button className="w-full text-xs font-medium py-2 rounded-lg border border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />AI가 구조 추천
          </button>
        </div>
      );
    }
  };

  // ── AI Preview content per category ──────────────────────────────────────────
  const AI_PREVIEWS: Record<string, string> = {
    "발표자료": "**[슬라이드 목차 초안]**\n\n1. 표지 — 스마트 주차 관리 시스템\n2. 문제 정의 — 도심 주차 문제\n3. 솔루션 소개 — AI 기반 빈자리 예측\n4. 핵심 기능 4가지\n5. 기술 스택 & 아키텍처\n6. AI 모델 성능 (87% → 90%)\n7. 시연 시나리오\n8. 기대 효과 & 확장성\n9. Q&A",
    "보고서": "**1. 프로젝트 개요**\n스마트 주차 관리 시스템은 AI 기반 빈자리 예측과 실시간 모니터링을 통해...\n\n**2. 개발 진행 현황**\n- 완료: 요구사항 분석, 시스템 설계, 핵심 기능 개발 (65%)\n- 진행 중: 결제 연동, AI 모델 고도화\n- 예정: 통합 테스트, 발표 준비",
    "README": "# 🚗 스마트 주차 관리 시스템\n\n> AI 기반 실시간 주차 빈자리 예측 및 예약 서비스\n\n## 핵심 기능\n- 실시간 주차 현황 모니터링\n- AI 빈자리 예측 (정확도 87%)\n- 모바일 사전 예약\n- 카카오페이 결제 연동\n\n## 기술 스택\n`React` `Spring Boot` `Python` `MySQL` `AWS`",
    "제안서": "**문제 정의**\n도심 내 불필요한 주차 탐색으로 인한 교통 혼잡과 탄소 배출이 심각합니다.\n\n**해결 방안**\nAI가 실시간으로 빈자리를 예측하고, 사전 예약 시스템을 통해 불필요한 이동을 최소화합니다.\n\n**차별성**\n기존 서비스와 달리 딥러닝 기반 예측 모델로 90% 이상의 정확도를 목표로 합니다.",
    "실험 보고서": "**실험 설계**\n- 모델: Random Forest + LSTM 앙상블\n- 데이터: CCTV 센서 90일치 (시간대별 120만 건)\n\n**평가 결과**\n| 모델 | Accuracy | MAE |\n|------|----------|-----|\n| RF   | 83%      | 2.1 |\n| LSTM | 87%      | 1.8 |\n| 앙상블| 89%     | 1.5 |",
    "회고": "**✅ Keep**\n- 회의록 AI 도입으로 업무 자동화 효율 향상\n- GitHub 코드리뷰 문화 정착\n\n**❌ Problem**\n- 결제 SDK 충돌로 일정 지연\n- QA 시간 부족\n\n**🔄 Try**\n- 블로커 발생 시 팀장에게 즉시 보고 원칙 강화\n- 다음 스프린트 QA 시간 2일 이상 확보",
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>

      {/* ── Top header ── */}
      <div className="shrink-0 px-5 pt-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-foreground">산출물 생성</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="산출물 검색..."
                className="pl-9 pr-4 py-1.5 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 w-44" />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
              <Plus className="w-3.5 h-3.5" />새 산출물
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-3">
          {DELIV_CATS.map(cat => {
            const Icon = DELIV_CAT_ICONS[cat] ?? FileText;
            const color = DELIV_CAT_COLORS[cat] ?? "#3B5BDB";
            const active = activeCat === cat;
            return (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${active ? "text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-slate-300"}`}
                style={active ? { background: color } : {}}>
                <Icon className="w-3 h-3" />{cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Left: creation form */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Common: title */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                {(() => { const Icon = DELIV_CAT_ICONS[activeCat] ?? FileText; const color = DELIV_CAT_COLORS[activeCat] ?? "#3B5BDB"; return <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:`${color}20` }}><Icon className="w-3.5 h-3.5" style={{ color }} /></div>; })()}
                <span className="text-sm font-bold text-foreground">{activeCat}</span>
              </div>
              <input value={delivTitle} onChange={e => setDelivTitle(e.target.value)} placeholder={`${activeCat} 제목 입력`}
                className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 mb-2" />
            </div>

            {/* Common: AI sources */}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI 참고 자료</div>
              <div className="flex flex-wrap gap-1.5">
                {DATA_SOURCES.map(s => (
                  <button key={s} onClick={() => toggleSource(s)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all ${selSources.includes(s) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                    {selSources.includes(s) && "✓ "}{s}
                  </button>
                ))}
              </div>
            </div>

            {/* Category-specific form */}
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">카테고리 설정</div>
              {renderCatForm()}
            </div>

            {/* Common: tone + format */}
            <div className="pt-3 border-t border-border space-y-3">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">생성 톤</div>
                <div className="grid grid-cols-2 gap-1">
                  {TONE_OPTIONS.map(t => (
                    <button key={t} onClick={() => setSelTone(t)}
                      className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-all ${selTone===t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">파일 형식</div>
                <div className="grid grid-cols-4 gap-1">
                  {FILE_FORMATS.map(f => (
                    <button key={f} onClick={() => setSelFormat(f)}
                      className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-all ${selFormat===f ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-slate-300"}`}>{f}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Deadline */}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">제출 마감일</div>
              <input type="date" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Generate button */}
          <div className="shrink-0 p-4 border-t border-border">
            <button onClick={handleGenerate} disabled={generating}
              className="w-full py-2.5 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-70"
              style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
              {generating ? (
                <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />초안 생성 중...</>
              ) : (
                <><Sparkles className="w-4 h-4" />AI 초안 생성</>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">{selSources.length}개 데이터 소스 참고 · {selFormat} 형식</p>
          </div>
        </div>

        {/* Center: card grid */}
        <div className={`flex-1 overflow-y-auto p-5 ${selCard ? "min-w-0" : ""}`}>
          {/* AI recommendation box */}
          <div className="mb-4 px-4 py-3 rounded-xl border border-purple-200 flex items-start gap-3" style={{ background:"rgba(112,72,232,0.05)" }}>
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color:"#7048E8" }} />
            <div className="text-xs text-muted-foreground leading-relaxed flex-1">
              <strong className="text-foreground">AI 추천:</strong> 6차 회의록과 업무 보드 데이터를 기반으로 <strong className="text-foreground">{activeCat}</strong> 초안을 바로 생성할 수 있습니다. 회의에서 결정된 내용과 현재 진행률이 자동 반영됩니다.
            </div>
            <button onClick={handleGenerate} className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80" style={{ background:"rgba(112,72,232,0.15)", color:"#7048E8" }}>
              바로 생성
            </button>
          </div>

          {/* Section title */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-foreground">산출물 목록 <span className="text-muted-foreground font-normal">({DELIV_CARDS.length}개)</span></div>
            <select className="text-xs border border-border rounded-lg px-2 py-1 bg-card outline-none text-muted-foreground">
              <option>최신순</option><option>유형별</option><option>상태별</option>
            </select>
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 gap-3">
            {DELIV_CARDS.filter(d => !search || d.title.toLowerCase().includes(search.toLowerCase())).map(d => {
              const Icon = DELIV_CAT_ICONS[d.type] ?? FileText;
              const color = DELIV_CAT_COLORS[d.type] ?? "#3B5BDB";
              const sm = STATUS_META[d.status];
              const isSelected = selCard === d.id;
              return (
                <div key={d.id} onClick={() => { setSelCard(d.id === selCard ? null : d.id); setPanelTab("info"); }}
                  className={`bg-card rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md group ${isSelected ? "border-blue-400 shadow-md" : "border-border shadow-sm hover:border-slate-300"}`}>
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:`${color}18` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">{d.type}</div>
                        <div className="text-xs font-bold text-foreground leading-snug">{d.title}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {d.author !== "—" && (
                        <div className="flex items-center gap-1">
                          {(() => { const m = MEMBERS.find(me => me.name === d.author); return m ? <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background:m.color }}>{m.initials}</div> : null; })()}
                          <span>{d.author}</span>
                        </div>
                      )}
                      {d.linkedTasks > 0 && <span className="px-1.5 py-0.5 rounded bg-muted font-medium">업무 {d.linkedTasks}개</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>{d.updatedAt}</span>
                      {d.fileType && <span className="font-semibold text-blue-600">{d.fileType}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700"><Eye className="w-3 h-3" />미리보기</button>
                    <button className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground ml-auto"><Download className="w-3 h-3" />다운로드</button>
                    <button className="p-0.5 rounded hover:bg-muted transition-colors"><MoreHorizontal className="w-3 h-3 text-muted-foreground" /></button>
                  </div>
                </div>
              );
            })}

            {/* Placeholder card for generating */}
            {generating && (
              <div className="bg-card rounded-xl p-4 border-2 border-dashed border-blue-300 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"rgba(112,72,232,0.15)" }}>
                    <Sparkles className="w-4 h-4" style={{ color:"#7048E8" }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{activeCat}</div>
                    <div className="text-xs font-semibold text-blue-600">AI 초안 생성 중...</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-1.5 bg-blue-500 rounded-full animate-pulse" style={{ width:"60%" }} />
                  </div>
                  <span className="text-[10px] text-blue-600 font-medium">60%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {selCardData && (
          <div className="w-80 shrink-0 border-l border-border flex flex-col h-full overflow-hidden bg-card">
            {/* Panel header */}
            <div className="flex items-start gap-2 p-4 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                  {(() => { const Icon = DELIV_CAT_ICONS[selCardData.type] ?? FileText; const color = DELIV_CAT_COLORS[selCardData.type] ?? "#3B5BDB"; return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background:`${color}18`, color }}><Icon className="w-2.5 h-2.5" />{selCardData.type}</span>; })()}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_META[selCardData.status].cls}`}>{STATUS_META[selCardData.status].label}</span>
                </div>
                <div className="text-sm font-bold text-foreground leading-snug">{selCardData.title}</div>
              </div>
              <button onClick={() => setSelCard(null)} className="p-1.5 hover:bg-muted rounded-lg shrink-0"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>

            {/* Panel tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["info","preview","versions"] as const).map(tab => {
                const l = { info:"정보", preview:"AI 미리보기", versions:"버전" };
                return <button key={tab} onClick={() => setPanelTab(tab)} className={`flex-1 text-[11px] font-semibold py-2.5 border-b-2 transition-colors ${panelTab===tab?"border-blue-500 text-blue-600":"border-transparent text-muted-foreground hover:text-foreground"}`}>{l[tab]}</button>;
              })}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {panelTab === "info" && (
                <>
                  <div className="space-y-2 text-xs">
                    {[
                      ["작성자", selCardData.author],
                      ["최근 업데이트", selCardData.updatedAt],
                      ["파일 형식", selCardData.fileType ?? "—"],
                      ["버전", selCardData.version ?? "—"],
                      ["연결된 업무", `${selCardData.linkedTasks}개`],
                    ].map(([l, v]) => (
                      <div key={l as string} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-20 shrink-0">{l}</span>
                        <span className="font-medium text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">참고한 데이터 출처</div>
                    <div className="flex flex-wrap gap-1.5">
                      {["6차 회의록","업무 보드","GitHub 기록","대시보드"].map(s => (
                        <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">액션</div>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                      <Download className="w-3.5 h-3.5" />다운로드 ({selCardData.fileType ?? "PDF"})
                    </button>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-medium border border-border bg-card text-foreground rounded-xl hover:bg-muted transition-colors">
                      <Pencil className="w-3.5 h-3.5" />직접 편집하기
                    </button>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-medium border border-border bg-card text-foreground rounded-xl hover:bg-muted transition-colors">
                      <Link2 className="w-3.5 h-3.5" />업무 보드에 연결
                    </button>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-medium rounded-xl transition-opacity hover:opacity-80" style={{ background:"rgba(112,72,232,0.1)", color:"#7048E8" }}>
                      <Sparkles className="w-3.5 h-3.5" />AI 재생성 요청
                    </button>
                  </div>
                  {/* AI feedback input */}
                  <div className="pt-3 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI 수정 요청</div>
                    <div className="flex gap-2">
                      <textarea value={aiComment} onChange={e => setAiComment(e.target.value)} rows={2}
                        placeholder="예: 결론 부분을 더 간결하게 해줘, 3페이지를 발표용으로 바꿔줘"
                        className="flex-1 text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
                      <button onClick={() => setAiComment("")} className="self-end p-2 rounded-lg text-white shrink-0" style={{ background:"var(--primary)" }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {panelTab === "preview" && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4" style={{ color:"#7048E8" }} />
                    <span className="text-xs font-semibold text-foreground">AI 생성 내용 미리보기</span>
                  </div>
                  {selCardData.status === "pending" ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background:"rgba(112,72,232,0.1)" }}>
                        <Sparkles className="w-6 h-6" style={{ color:"#7048E8" }} />
                      </div>
                      <div className="text-sm font-semibold text-foreground">아직 생성되지 않았습니다</div>
                      <p className="text-xs text-muted-foreground">왼쪽 패널에서 설정 후 AI 초안 생성을 클릭하세요.</p>
                      <button onClick={handleGenerate} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90" style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                        <Sparkles className="w-4 h-4" />지금 생성하기
                      </button>
                    </div>
                  ) : (
                    <div className="bg-muted/50 rounded-xl p-4 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono border border-border">
                      {AI_PREVIEWS[selCardData.type] ?? "AI가 생성한 내용이 여기에 표시됩니다."}
                    </div>
                  )}
                </div>
              )}

              {panelTab === "versions" && (
                <div className="space-y-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">버전 기록</div>
                  {[
                    { ver:"v0.1", date:"12.10 14:32", note:"AI 초안 생성 (6차 회의록 기반)", author:"AI" },
                    { ver:"v0.2", date:"12.10 16:14", note:"발표 유형을 최종발표로 변경", author:"김민준" },
                    { ver:"v0.3", date:"12.11 09:30", note:"슬라이드 3~5장 내용 보강", author:"이서연" },
                  ].map(v => {
                    const isAI = v.author === "AI";
                    return (
                      <div key={v.ver} className="flex items-start gap-2.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5 ${isAI ? "" : ""}`}
                          style={{ background: isAI ? "#7048E8" : (MEMBERS.find(m => m.name === v.author)?.color ?? "#8892A4") }}>
                          {isAI ? "AI" : v.author[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-foreground">{v.ver}</span>
                            <span className="text-[10px] text-muted-foreground">{v.date}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{v.note}</div>
                          <button className="text-[10px] text-blue-600 hover:text-blue-700 mt-0.5">이 버전으로 복원</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── github view ──────────────────────────────────────────────────────────────
