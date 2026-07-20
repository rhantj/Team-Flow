import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { AuthInput } from "../components/AuthInput";
import { useAuth } from "../../global/hooks/useAuth";
import { API_BASE_URL, type ApiEnvelope } from "../../global/api/apiClient";
import type { AuthTokenResponse } from "../../global/api/authTypes";
import { tokenStore } from "../../global/api/tokenStore";

const DEV_TEST_ACCOUNTS = [
  { id: "1", name: "김민준", role: "팀장", email: "kim.minjun@university.ac.kr" },
  { id: "2", name: "이서연", role: "팀원", email: "lee.seoyeon@university.ac.kr" },
  { id: "3", name: "박지수", role: "팀원", email: "park.jisu@university.ac.kr" },
  { id: "4", name: "최동혁", role: "심사자", email: "choi.prof@university.ac.kr" },
];
const demoAuthEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_AUTH === "true";

export function LoginScreen() {
  const navigate = useNavigate();
  const { loginWithGoogle, refreshMe } = useAuth();
  const [searchParams] = useSearchParams();
  const [devLoginError, setDevLoginError] = useState<string | null>(null);
  const [devLoggingInId, setDevLoggingInId] = useState<string | null>(null);
  const [email, setEmail] = useState("kim.minjun@university.ac.kr");
  const [password, setPassword] = useState("workflow1234");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const oauthFailed = searchParams.get("error") === "oauth_failed";

  const handleDevLogin = async (demoUserId: string) => {
    if (devLoggingInId) return;
    setDevLoginError(null);
    setDevLoggingInId(demoUserId);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/dev-login-token/${demoUserId}`);
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error("인증 서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      }
      const body = await response.json() as ApiEnvelope<AuthTokenResponse>;
      if (!response.ok || !body.success || !body.data?.accessToken || !body.data?.refreshToken) {
        throw new Error(body.error?.message ?? "개발용 로그인에 실패했습니다.");
      }
      tokenStore.clear();
      tokenStore.setTokens(body.data.accessToken, body.data.refreshToken);
      await refreshMe();
      navigate("/projects", { replace: true });
    } catch (error) {
      setDevLoginError(error instanceof Error ? error.message : "개발용 로그인에 실패했습니다.");
    } finally {
      setDevLoggingInId(null);
    }
  };

  // 현재 서버에는 별도 ID/PW 인증 API가 없어 로컬/데모에서는 개발용 토큰 발급 흐름을 재사용한다.
  const handleIdPwLogin = () => {
    if (!demoAuthEnabled) {
      setDevLoginError("ID/PW 로그인 API가 아직 연결되지 않았습니다. Google 로그인을 이용해주세요.");
      return;
    }
    const id = email.trim();
    const matched = DEV_TEST_ACCOUNTS.find(account => (
      account.id === id ||
      account.name === id ||
      account.email === id
    ));
    if (!matched) {
      setDevLoginError("등록된 테스트 계정이 아닙니다. 이메일, 이름 또는 번호(1~4)를 입력해주세요.");
      return;
    }
    if (!password.trim()) {
      setDevLoginError("비밀번호를 입력해주세요.");
      return;
    }
    void handleDevLogin(matched.id);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-background px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">다시 만나서 반가워요!</h1>
            <p className="text-sm text-muted-foreground">계속하려면 로그인하세요.</p>
          </div>

          {oauthFailed && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
              Google 로그인에 실패했습니다. 다시 시도해주세요.
            </div>
          )}

          <div className="space-y-4">
            <AuthInput label="이메일 또는 ID" type="text" placeholder="name@university.ac.kr"
              value={email} onChange={setEmail} icon={Mail} />
            <AuthInput
              label="비밀번호" type={showPassword ? "text" : "password"} placeholder="비밀번호 입력"
              value={password} onChange={setPassword} icon={Lock}
              right={
                <button type="button" onClick={() => setShowPassword(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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

          {devLoginError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
              {devLoginError}
            </div>
          )}

          <button
            onClick={handleIdPwLogin}
            disabled={Boolean(devLoggingInId)}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-70 hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}
          >
            {devLoggingInId ? (
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

          <button
            onClick={loginWithGoogle}
            className="w-full py-3 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-all hover:bg-muted flex items-center justify-center gap-2.5"
          >
            <GoogleIcon />
            Google로 계속하기
          </button>

          <p className="text-center text-sm text-muted-foreground mt-6">
            아직 계정이 없으신가요?{" "}
            <button onClick={() => navigate("/signup")} className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              회원가입
            </button>
          </p>

          {demoAuthEnabled && (
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-center text-[11px] font-semibold text-amber-600 mb-3">
                ⚠ 개발/데모 전용 — 아래는 실제 계정 인증이 아닙니다
              </p>

              <p className="text-center text-[11px] font-semibold text-muted-foreground mb-3">개발용 테스트 계정으로 입장</p>
              <div className="grid grid-cols-2 gap-2">
                {DEV_TEST_ACCOUNTS.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => void handleDevLogin(account.id)}
                    disabled={Boolean(devLoggingInId)}
                    className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl border border-dashed border-border bg-muted/40 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>{account.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {devLoggingInId === account.id ? "로그인 중..." : account.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 34.9 27 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.6 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C39.5 37.4 44 31.3 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
