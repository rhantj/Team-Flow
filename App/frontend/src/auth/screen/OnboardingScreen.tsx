import { useState } from "react";
import { useNavigate } from "react-router";
import {
  GraduationCap, Users, Trophy, Cpu, Zap, PenLine, Check, User, UserCheck,
  AlertTriangle, Link, Shield, Copy, CheckCircle2, X, ArrowLeft, ArrowRight, Sparkles,
} from "lucide-react";
import { StepIndicator } from "../components/StepIndicator";
import { useAuth } from "../../global/hooks/useAuth";

const PROJECT_TYPES = [
  { id: "capstone", label: "캡스톤디자인", sub: "전공 프로젝트", icon: GraduationCap, color: "#3B5BDB" },
  { id: "team",     label: "팀프로젝트",   sub: "일반 팀프로젝트", icon: Users,           color: "#7048E8" },
  { id: "contest",  label: "공모전",        sub: "아이디어·창업",   icon: Trophy,          color: "#F59E0B" },
  { id: "ai",       label: "AI 경진대회",   sub: "모델·실험 중심",  icon: Cpu,             color: "#10B981" },
  { id: "hackathon",label: "해커톤",        sub: "단기 집중 개발",  icon: Zap,             color: "#EF4444" },
  { id: "other",    label: "기타",          sub: "직접 입력",       icon: PenLine,         color: "#8892A4" },
];

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { signupName: userName, completeOnboarding } = useAuth();
  const onDone = () => { completeOnboarding(); navigate("/dashboard"); };

  const [step, setStep] = useState(0); // 0-3
  const [projectType, setProjectType] = useState("");
  const [customType, setCustomType] = useState("");
  const [teamSize, setTeamSize] = useState(4);
  const [leaderName, setLeaderName] = useState(userName || "김민준");
  const [isSelfLeader, setIsSelfLeader] = useState(true);
  const [copied, setCopied] = useState<"member" | "judge" | null>(null);

  const memberUrl = "https://teamflow.ai/invite/gX4mKp";
  const judgeUrl  = "https://teamflow.ai/judge/J8nQrT";

  const handleCopy = (which: "member" | "judge") => {
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const STEPS = ["프로젝트 목적", "팀원 설정", "팀장 지정", "초대 링크"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {/* top logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: "linear-gradient(135deg, #7048E8, #4F6EF7)" }}>
          TF
        </div>
        <span className="font-bold text-foreground text-base">TeamFlow AI</span>
      </div>

      {/* card */}
      <div className="w-full max-w-xl bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
        {/* card header */}
        <div className="px-8 pt-7 pb-5 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <StepIndicator current={step} total={4} />
            <span className="text-xs font-semibold text-muted-foreground">{step + 1} / 4 단계</span>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{STEPS[step]}</div>
          <h2 className="text-lg font-bold text-foreground">
            {step === 0 && "어떤 목적으로 사용하시나요?"}
            {step === 1 && "팀원은 몇 명인가요?"}
            {step === 2 && "팀장을 지정해주세요"}
            {step === 3 && "팀을 초대하세요"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 0 && "프로젝트 유형에 따라 AI 기능이 최적화됩니다."}
            {step === 1 && "본인 포함 전체 팀원 수를 선택해주세요."}
            {step === 2 && "팀장은 업무 배정과 팀 코멘트 관리 권한을 갖습니다."}
            {step === 3 && "팀원과 심사자는 서로 다른 접근 권한을 가집니다."}
          </p>
        </div>

        {/* card body */}
        <div className="px-8 py-7">

          {/* ── step 0: project type ── */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {PROJECT_TYPES.map(t => (
                  <button key={t.id} onClick={() => setProjectType(t.id)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all hover:shadow-sm ${projectType === t.id ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                    style={projectType === t.id ? { borderColor: t.color, background: `${t.color}0A` } : {}}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: projectType === t.id ? `${t.color}20` : "#F4F6FA" }}>
                      <t.icon className="w-4.5 h-4.5" style={{ color: projectType === t.id ? t.color : "#8892A4", width: 18, height: 18 }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground">{t.sub}</div>
                    </div>
                    {projectType === t.id && (
                      <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: t.color }}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {projectType === "other" && (
                <div className="mt-1">
                  <input
                    autoFocus
                    value={customType}
                    onChange={e => setCustomType(e.target.value)}
                    placeholder="프로젝트 유형을 직접 입력하세요"
                    className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── step 1: team size ── */}
          {step === 1 && (
            <div className="flex flex-col items-center gap-8 py-4">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setTeamSize(v => Math.max(2, v - 1))}
                  className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-xl font-bold text-foreground hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-30"
                  disabled={teamSize <= 2}>
                  –
                </button>
                <div className="text-center">
                  <div className="text-5xl font-bold" style={{ color: "var(--primary)" }}>{teamSize}</div>
                  <div className="text-sm text-muted-foreground mt-1">명</div>
                </div>
                <button
                  onClick={() => setTeamSize(v => Math.min(12, v + 1))}
                  className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-xl font-bold text-foreground hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-30"
                  disabled={teamSize >= 12}>
                  +
                </button>
              </div>

              {/* size presets */}
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => setTeamSize(n)}
                    className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-all ${teamSize === n ? "border-blue-500 bg-blue-50 text-blue-600" : "border-border bg-muted text-muted-foreground hover:border-slate-300"}`}>
                    {n}
                  </button>
                ))}
              </div>

              {/* visual avatars */}
              <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                {Array.from({ length: teamSize }).map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ background: ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"][i % 6] }}>
                    <User className="w-4 h-4" />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">본인 포함 총 {teamSize}명 · 나중에 추가/제거 가능합니다</p>
            </div>
          )}

          {/* ── step 2: leader ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* current user card */}
              <button onClick={() => setIsSelfLeader(true)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${isSelfLeader ? "border-blue-500 bg-blue-50" : "border-border hover:border-slate-300"}`}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base" style={{ background: "#3B5BDB" }}>
                  {(userName || "김")[0]}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">{userName || "김민준"} <span className="text-[11px] font-normal text-blue-500 ml-1">나</span></div>
                  <div className="text-xs text-muted-foreground">{/* email placeholder */}현재 로그인한 계정</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelfLeader ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                  {isSelfLeader && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">또는 다른 팀원을 팀장으로</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button onClick={() => setIsSelfLeader(false)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${!isSelfLeader ? "border-blue-500 bg-blue-50" : "border-border hover:border-slate-300"}`}>
                <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">다른 팀원 지정</div>
                  <div className="text-xs text-muted-foreground">팀장 이름 또는 이메일 입력</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${!isSelfLeader ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                  {!isSelfLeader && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>

              {!isSelfLeader && (
                <input
                  autoFocus
                  value={leaderName}
                  onChange={e => setLeaderName(e.target.value)}
                  placeholder="팀장 이름 또는 이메일"
                  className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">팀장은 업무 배정, 팀 코멘트 작성, 팀원 관리 권한을 갖습니다. 나중에 변경할 수 있습니다.</p>
              </div>
            </div>
          )}

          {/* ── step 3: invite URLs ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* member invite */}
              <div className="rounded-xl border-2 border-blue-200 p-4 bg-blue-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#3B5BDB" }}>
                    <Users className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">팀원 초대 링크</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">팀원은 회의록, 업무 보드, 대시보드, 산출물에 접근할 수 있습니다.</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-blue-200">
                  <Link className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="flex-1 text-xs font-mono text-foreground truncate">{memberUrl}</span>
                  <button onClick={() => handleCopy("member")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${copied === "member" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600 hover:bg-blue-200"}`}>
                    {copied === "member" ? <><Check className="w-3 h-3" /> 복사됨!</> : <><Copy className="w-3 h-3" /> 복사</>}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["회의록 열람", "업무 수행", "댓글 작성", "산출물 공동 작업"].map(p => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">{p}</span>
                  ))}
                </div>
              </div>

              {/* judge invite */}
              <div className="rounded-xl border-2 border-purple-200 p-4" style={{ background: "rgba(112,72,232,0.04)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#7048E8" }}>
                    <Shield className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">심사자 전용 링크</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(112,72,232,0.15)", color: "#7048E8" }}>교수·조교·심사위원</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">심사자는 개인별 기여도 리포트·AI 평가 근거·최종 점수 관리에 접근할 수 있습니다.</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-purple-200">
                  <Link className="w-3.5 h-3.5 shrink-0" style={{ color: "#7048E8" }} />
                  <span className="flex-1 text-xs font-mono text-foreground truncate">{judgeUrl}</span>
                  <button onClick={() => handleCopy("judge")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${copied === "judge" ? "bg-emerald-100 text-emerald-600" : "hover:opacity-80"}`}
                    style={copied !== "judge" ? { background: "rgba(112,72,232,0.12)", color: "#7048E8" } : {}}>
                    {copied === "judge" ? <><Check className="w-3 h-3" /> 복사됨!</> : <><Copy className="w-3 h-3" /> 복사</>}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["기여도 리포트", "AI 평가 근거", "최종 점수 입력", "평가 데이터 전용"].map(p => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>{p}</span>
                  ))}
                </div>
              </div>

              {/* permission table */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted border-b border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">권한 비교</span>
                </div>
                <div className="divide-y divide-border">
                  {[
                    { feature: "대시보드·업무 보드", member: true, judge: true },
                    { feature: "회의록·AI 요약", member: true, judge: true },
                    { feature: "산출물 생성", member: true, judge: true },
                    { feature: "기여도 리포트", member: false, judge: true },
                    { feature: "AI 평가 근거", member: false, judge: true },
                    { feature: "최종 점수 관리", member: false, judge: true },
                  ].map(r => (
                    <div key={r.feature} className="flex items-center px-4 py-2 text-xs">
                      <span className="flex-1 text-foreground font-medium">{r.feature}</span>
                      <div className="flex gap-8">
                        <span className="w-12 text-center">{r.member ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}</span>
                        <span className="w-12 text-center">{r.judge ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center px-4 py-2 text-xs bg-muted/50">
                    <span className="flex-1 text-muted-foreground" />
                    <div className="flex gap-8 text-[11px] font-semibold">
                      <span className="w-12 text-center text-blue-600">팀원</span>
                      <span className="w-12 text-center" style={{ color: "#7048E8" }}>심사자</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* card footer */}
        <div className="px-8 pb-7 pt-2 flex items-center justify-between">
          <button
            onClick={() => setStep(s => s - 1)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${step === 0 ? "invisible" : ""}`}>
            <ArrowLeft className="w-4 h-4" /> 이전
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !projectType}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}>
              다음 <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onDone}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
              <Sparkles className="w-4 h-4" /> 시작하기
            </button>
          )}
        </div>
      </div>

      {/* skip link */}
      <button onClick={onDone} className="mt-5 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
        나중에 설정하기
      </button>
    </div>
  );
}
