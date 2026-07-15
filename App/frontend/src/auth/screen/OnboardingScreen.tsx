import { useState } from "react";
import { useNavigate } from "react-router";
import {
  GraduationCap, Users, Trophy, Cpu, Zap, PenLine, Check, User,
  AlertTriangle, Mail, Shield, ArrowLeft, ArrowRight, Sparkles, Plus, Trash2,
} from "lucide-react";
import { StepIndicator } from "../components/StepIndicator";
import { useAuth } from "../../global/hooks/useAuth";
import { createInvitation, createProject } from "../../global/api/projectsApi";

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
  const { user, refreshMe } = useAuth();
  const userName = user?.name ?? "";

  const [step, setStep] = useState(0); // 0-3
  const [projectType, setProjectType] = useState("");
  const [customType, setCustomType] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [teamSize, setTeamSize] = useState(4);
  const [memberEmails, setMemberEmails] = useState<string[]>([""]);
  const [reviewerEmails, setReviewerEmails] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resolvedType = projectType === "other" ? customType : PROJECT_TYPES.find(t => t.id === projectType)?.label ?? "";

  const updateEmailAt = (list: string[], setList: (v: string[]) => void, index: number, value: string) => {
    const next = [...list];
    next[index] = value;
    setList(next);
  };
  const addEmailRow = (list: string[], setList: (v: string[]) => void) => setList([...list, ""]);
  const removeEmailRow = (list: string[], setList: (v: string[]) => void, index: number) =>
    setList(list.filter((_, i) => i !== index));

  const handleFinish = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const project = await createProject({
        title: projectTitle.trim(),
        type: resolvedType || undefined,
      });

      const invites = [
        ...memberEmails.filter(e => e.trim()).map(email => ({ email: email.trim(), role: "팀원" as const })),
        ...reviewerEmails.filter(e => e.trim()).map(email => ({ email: email.trim(), role: "심사자" as const })),
      ];
      for (const invite of invites) {
        await createInvitation(project.id, invite.email, invite.role);
      }

      await refreshMe();
      navigate("/dashboard");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const onSkip = () => navigate("/dashboard");

  const STEPS = ["프로젝트 목적", "팀원 설정", "팀장 안내", "팀원 초대"];
  const canGoNext = step === 0 ? Boolean(projectType && projectTitle.trim()) : true;

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
            {step === 2 && "팀장 안내"}
            {step === 3 && "팀을 초대하세요"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 0 && "프로젝트 이름과 유형에 따라 AI 기능이 최적화됩니다."}
            {step === 1 && "본인 포함 전체 팀원 수를 선택해주세요."}
            {step === 2 && "팀장은 업무 배정과 팀 코멘트 관리 권한을 갖습니다."}
            {step === 3 && "이메일로 초대하면 팀원과 심사자는 서로 다른 접근 권한을 가집니다."}
          </p>
        </div>

        {/* card body */}
        <div className="px-8 py-7">

          {/* ── step 0: project type + title ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">프로젝트 이름</label>
                <input
                  value={projectTitle}
                  onChange={e => setProjectTitle(e.target.value)}
                  placeholder="예: WorkFlow AI"
                  className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

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

          {/* ── step 1: team size (informational) ── */}
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

              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => setTeamSize(n)}
                    className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-all ${teamSize === n ? "border-blue-500 bg-blue-50 text-blue-600" : "border-border bg-muted text-muted-foreground hover:border-slate-300"}`}>
                    {n}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                {Array.from({ length: teamSize }).map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ background: ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"][i % 6] }}>
                    <User className="w-4 h-4" />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">본인 포함 총 {teamSize}명 · 다음 단계에서 이메일로 초대할 수 있습니다</p>
            </div>
          )}

          {/* ── step 2: leader (informational only — creator is always LEADER) ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-500 bg-blue-50">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base" style={{ background: "#3B5BDB" }}>
                  {(userName || "?")[0]}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">{userName} <span className="text-[11px] font-normal text-blue-500 ml-1">나</span></div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </div>
                <div className="w-5 h-5 rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  프로젝트를 생성하면 회원님이 팀장이 됩니다. 팀장은 업무 배정, 팀 코멘트 작성, 팀원 관리 권한을 갖습니다.
                  리더십은 생성 이후 프로젝트 설정에서 다른 팀원에게 이전할 수 있습니다.
                </p>
              </div>
            </div>
          )}

          {/* ── step 3: real per-email invitations ── */}
          {step === 3 && (
            <div className="space-y-4">
              {submitError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {submitError}
                </div>
              )}

              <EmailInviteGroup
                title="팀원 초대"
                description="팀원은 회의록, 업무 보드, 대시보드, 산출물에 접근할 수 있습니다."
                icon={Users}
                color="#3B5BDB"
                emails={memberEmails}
                onChange={(i, v) => updateEmailAt(memberEmails, setMemberEmails, i, v)}
                onAdd={() => addEmailRow(memberEmails, setMemberEmails)}
                onRemove={i => removeEmailRow(memberEmails, setMemberEmails, i)}
              />

              <EmailInviteGroup
                title="심사자 초대"
                description="심사자는 개인별 기여도 리포트·AI 평가 근거·최종 점수 관리에 접근할 수 있습니다."
                icon={Shield}
                color="#7048E8"
                emails={reviewerEmails}
                onChange={(i, v) => updateEmailAt(reviewerEmails, setReviewerEmails, i, v)}
                onAdd={() => addEmailRow(reviewerEmails, setReviewerEmails)}
                onRemove={i => removeEmailRow(reviewerEmails, setReviewerEmails, i)}
              />

              <p className="text-[11px] text-muted-foreground">지금 초대하지 않아도 나중에 프로젝트 설정에서 초대할 수 있습니다.</p>
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
              disabled={!canGoNext}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}>
              다음 <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
              {submitting ? (
                <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 생성 중...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 시작하기</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* skip link */}
      <button onClick={onSkip} className="mt-5 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
        나중에 설정하기
      </button>
    </div>
  );
}

function EmailInviteGroup({ title, description, icon: Icon, color, emails, onChange, onAdd, onRemove }: {
  title: string; description: string; icon: any; color: string;
  emails: string[]; onChange: (index: number, value: string) => void;
  onAdd: () => void; onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-xl border-2 p-4" style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color }}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>

      <div className="space-y-2">
        {emails.map((email, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-white border border-border">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="email"
                value={email}
                onChange={e => onChange(i, e.target.value)}
                placeholder="name@university.ac.kr"
                className="flex-1 text-xs text-foreground outline-none bg-transparent"
              />
            </div>
            {emails.length > 1 && (
              <button onClick={() => onRemove(i)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={onAdd} className="mt-2 flex items-center gap-1 text-xs font-semibold" style={{ color }}>
        <Plus className="w-3.5 h-3.5" /> 이메일 추가
      </button>
    </div>
  );
}
