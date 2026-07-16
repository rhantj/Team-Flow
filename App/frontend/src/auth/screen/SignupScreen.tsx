import { useNavigate } from "react-router";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { useAuth } from "../../global/hooks/useAuth";

export function SignupScreen() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-background px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">TeamFlow AI 시작하기</h1>
            <p className="text-sm text-muted-foreground">
              Google 계정 하나로 가입과 로그인이 한번에 끝나요. 팀 프로젝트를 스마트하게 관리해보세요.
            </p>
          </div>

          <button
            onClick={loginWithGoogle}
            className="w-full py-3 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-all hover:bg-muted flex items-center justify-center gap-2.5"
          >
            <GoogleIcon />
            Google로 시작하기
          </button>

          <p className="text-center text-[11px] text-muted-foreground mt-4 leading-relaxed">
            계속 진행하면 이용약관 및 개인정보처리방침에 동의하는 것으로 간주됩니다.
          </p>

          <p className="text-center text-sm text-muted-foreground mt-6">
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
