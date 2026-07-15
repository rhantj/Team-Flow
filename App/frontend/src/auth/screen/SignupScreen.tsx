import { useState } from "react";
import { useNavigate } from "react-router";
import { User, Mail, Lock, Eye, EyeOff, Check, CheckCircle2, AlertTriangle, ArrowRight, Clock, FileText, GraduationCap, ShieldCheck } from "lucide-react";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { AuthInput } from "../components/AuthInput";
import { useAuth } from "../../global/hooks/useAuth";

export function SignupScreen() {
  const navigate = useNavigate();
  const { completeSignup, approveProfessorSignup, login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isProfessor, setIsProfessor] = useState(false);
  const [professorNo, setProfessorNo] = useState("");
  const [certificateName, setCertificateName] = useState("");
  const [approvalSubmitted, setApprovalSubmitted] = useState(false);

  const pwMatch = pw && pwConfirm && pw === pwConfirm;
  const pwMismatch = pw && pwConfirm && pw !== pwConfirm;
  const professorValid = !isProfessor || Boolean(professorNo.trim() || certificateName);
  const valid = Boolean(name && email && pw && pwMatch && agreed && professorValid);

  const handleSubmit = () => {
    if (!valid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      completeSignup(name || "김민준");
      if (isProfessor) {
        setApprovalSubmitted(true);
      } else {
        login(null);
        navigate("/projects");
      }
    }, 1000);
  };

  const handleApproveDemo = () => {
    approveProfessorSignup(name || "박교수");
    navigate("/projects");
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-background px-4 sm:px-8 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          {approvalSubmitted ? (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>
                <Clock className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">관리자 승인 대기 중</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                교수 인증 정보가 제출되었습니다. 관리자 승인 후 가입이 완료되며,
                승인된 계정은 심사자 권한으로 로그인됩니다.
              </p>

              <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-violet-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-violet-700">승인 후 제공 화면</div>
                    <div className="text-xs text-violet-600 mt-1 leading-relaxed">
                      담당 프로젝트 목록, 개인별 기여도 리포트, AI 평가 근거, 최종 점수 입력 화면
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={handleApproveDemo}
                className="mt-5 w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
                <ShieldCheck className="w-4 h-4" />
                승인 완료 시연하기
              </button>
              <button onClick={() => navigate("/login")} className="w-full mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700">
                로그인 화면으로 이동
              </button>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-bold text-foreground mb-1">TeamFlow AI 시작하기</h1>
                <p className="text-sm text-muted-foreground">팀 프로젝트를 스마트하게 관리해보세요.</p>
              </div>

              <div className="space-y-4">
                <AuthInput label="이름" placeholder="실명을 입력하세요" value={name} onChange={setName} icon={User} />
                <AuthInput label="이메일" type="email" placeholder="name@university.ac.kr" value={email} onChange={setEmail} icon={Mail} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPw ? "text" : "password"}
                      placeholder="8자 이상 입력"
                      value={pw}
                      onChange={e => setPw(e.target.value)}
                      className="w-full rounded-xl border border-border bg-input-background text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      style={{ padding: "10px 36px 10px 36px" }}
                    />
                    <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">비밀번호 확인</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      placeholder="비밀번호를 다시 입력"
                      value={pwConfirm}
                      onChange={e => setPwConfirm(e.target.value)}
                      className={`w-full rounded-xl border text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 transition-all bg-input-background ${pwMismatch ? "border-red-400 focus:ring-red-100" : pwMatch ? "border-emerald-400 focus:ring-emerald-100" : "border-border focus:border-blue-400 focus:ring-blue-100"}`}
                      style={{ padding: "10px 36px 10px 36px" }}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {pwMatch && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {pwMismatch && <AlertTriangle className="w-4 h-4 text-red-400" />}
                    </div>
                  </div>
                  {pwMismatch && <span className="text-xs text-red-500">비밀번호가 일치하지 않습니다.</span>}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-card p-4">
                <button type="button" onClick={() => setIsProfessor(v => !v)} className="w-full flex items-start gap-3 text-left">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center mt-0.5 shrink-0 ${isProfessor ? "border-violet-500 bg-violet-500" : "border-border"}`}>
                    {isProfessor && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-violet-600" />
                      <span className="text-sm font-bold text-foreground">교수/심사자 계정으로 신청합니다</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      인증 후 심사자 전용 UI와 평가 기능을 사용할 수 있습니다.
                    </p>
                  </div>
                </button>

                {isProfessor && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground">교수 일련번호 또는 교직원 번호</label>
                      <input
                        value={professorNo}
                        onChange={e => setProfessorNo(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        placeholder="예: PROF-2026-001"
                      />
                    </div>
                    <label className="block">
                      <span className="text-xs font-semibold text-foreground">인증 서류 첨부</span>
                      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-dashed border-violet-200 bg-violet-50 px-3 py-3">
                        <FileText className="w-4 h-4 text-violet-600" />
                        <span className="flex-1 text-xs text-violet-700 truncate">{certificateName || "재직증명서, 교원증 이미지 등"}</span>
                        <span className="text-xs font-semibold text-violet-700">선택</span>
                      </div>
                      <input type="file" className="hidden" onChange={e => setCertificateName(e.target.files?.[0]?.name ?? "")} />
                    </label>
                    <div className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
                      가입하기를 누르면 관리자 승인 후 가입 처리됩니다.
                    </div>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-2 mt-5 mb-6 cursor-pointer select-none">
                <div onClick={() => setAgreed(v => !v)}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all mt-0.5 cursor-pointer shrink-0 ${agreed ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                  {agreed && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  <button className="font-semibold text-blue-600 hover:text-blue-700">이용약관</button> 및{" "}
                  <button className="font-semibold text-blue-600 hover:text-blue-700">개인정보처리방침</button>에 동의합니다.
                </span>
              </label>

              <button onClick={handleSubmit} disabled={!valid || loading}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: valid ? "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" : "#C1C9D9" }}>
                {loading ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 가입 중...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> 가입하기</>
                )}
              </button>

              <p className="text-center text-sm text-muted-foreground mt-4">
                이미 계정이 있으신가요?{" "}
                <button onClick={() => navigate("/login")} className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                  로그인
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
