import { useState } from "react";
import { useNavigate } from "react-router";
import { User, Mail, Lock, Eye, EyeOff, Check, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { AuthInput } from "../components/AuthInput";
import { useAuth } from "../../global/hooks/useAuth";

export function SignupScreen() {
  const navigate = useNavigate();
  const { completeSignup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const pwMatch = pw && pwConfirm && pw === pwConfirm;
  const pwMismatch = pw && pwConfirm && pw !== pwConfirm;
  const valid = name && email && pw && pwMatch && agreed;

  const handleSubmit = () => {
    if (!valid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      completeSignup("김민준");
      navigate("/onboarding");
    }, 1000);
  };

  return (
    <div className="flex h-screen" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-background px-8 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
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
        </div>
      </div>
    </div>
  );
}
