import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Lock, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { AuthBrandPanel } from "../../components/auth/AuthBrandPanel";
import { AuthInput } from "../../components/common/AuthInput";
import { useAuth } from "../../hooks/useAuth";

export function LoginScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("kim.minjun@university.ac.kr");
  const [pw, setPw] = useState("••••••••");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleSubmit = () => {
    if (!email || !pw) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); login(); navigate("/dashboard"); }, 1000);
  };

  return (
    <div className="flex h-screen" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      {/* right form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">다시 만나서 반가워요!</h1>
            <p className="text-sm text-muted-foreground">계속하려면 로그인하세요.</p>
          </div>

          <div className="space-y-4">
            <AuthInput label="이메일" type="email" placeholder="name@university.ac.kr" value={email} onChange={setEmail} icon={Mail} />
            <AuthInput
              label="비밀번호" type={showPw ? "text" : "password"} placeholder="비밀번호 입력"
              value={pw} onChange={setPw} icon={Lock}
              right={
                <button onClick={() => setShowPw(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <div className="flex items-center justify-between mt-3 mb-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div onClick={() => setRemember(v => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer ${remember ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                {remember && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-muted-foreground">로그인 유지</span>
            </label>
            <button className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">비밀번호 찾기</button>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-70 hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}>
            {loading ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 로그인 중...</>
            ) : (
              <><ArrowRight className="w-4 h-4" /> 로그인</>
            )}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">또는</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            아직 계정이 없으신가요?{" "}
            <button onClick={() => navigate("/signup")} className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              회원가입
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
