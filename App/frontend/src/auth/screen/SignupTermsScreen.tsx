import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Check } from "lucide-react";
import { AuthBrandPanel } from "../components/AuthBrandPanel";

interface SignupDraft {
  name: string;
  email: string;
  pw: string;
  pwConfirm: string;
  isProfessor: boolean;
  professorNo: string;
}

export function SignupTermsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const draft = (location.state as { draft?: SignupDraft } | null)?.draft;
  const [checked, setChecked] = useState(false);

  // 체크와 동시에 회원가입 화면으로 돌아간다 — 별도의 "동의 완료" 버튼을 두지 않는다.
  // replace: true로 이동해, 뒤로 가기를 눌러도 이 약관 페이지가 히스토리에 다시 끼어들지 않게 한다.
  const handleAgree = () => {
    setChecked(true);
    navigate("/signup", { replace: true, state: { agreed: true, draft } });
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-background px-4 sm:px-8 overflow-y-auto py-8">
        <div className="w-full max-w-lg">
          <button
            onClick={() => navigate("/signup", { state: { draft } })}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            회원가입으로 돌아가기
          </button>

          <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
            <h1 className="text-xl font-bold text-foreground mb-1">이용약관 및 개인정보처리방침</h1>
            <p className="text-xs text-muted-foreground mb-5">
              아래 내용을 확인한 뒤 맨 아래 체크박스를 선택해주세요.
            </p>

            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-muted/30 p-4 space-y-4 text-xs leading-relaxed text-muted-foreground">
              <section>
                <h2 className="text-sm font-bold text-foreground mb-1">제1조 (목적)</h2>
                <p>
                  이 약관은 TeamFlow AI(이하 "서비스")가 제공하는 팀 프로젝트 관리 서비스의 이용과
                  관련하여 서비스와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                </p>
              </section>
              <section>
                <h2 className="text-sm font-bold text-foreground mb-1">제2조 (이용자의 의무)</h2>
                <p>
                  이용자는 서비스 이용 시 관계 법령, 이 약관의 규정, 이용안내 및 서비스와 관련하여
                  공지한 주의사항을 준수해야 하며, 타인의 정보를 도용하거나 서비스 운영을 방해하는
                  행위를 해서는 안 됩니다.
                </p>
              </section>
              <section>
                <h2 className="text-sm font-bold text-foreground mb-1">제3조 (개인정보의 수집 및 이용)</h2>
                <p>
                  서비스는 회원가입 및 서비스 제공을 위해 이름, 이메일, 소속, 관심 분야, GitHub
                  아이디, 프로필 사진 등의 정보를 수집하며, 수집된 정보는 안내한 목적 범위 내에서만
                  이용됩니다.
                </p>
              </section>
              <section>
                <h2 className="text-sm font-bold text-foreground mb-1">제4조 (회의록 및 업무 데이터의 처리)</h2>
                <p>
                  서비스에 업로드된 회의록 음성/텍스트 및 업무 관련 데이터는 AI 요약·분석 기능 제공을
                  위해 처리되며, 팀 프로젝트 종료 후에도 학습 성과 평가 목적으로 일정 기간 보관될 수
                  있습니다.
                </p>
              </section>
              <section>
                <h2 className="text-sm font-bold text-foreground mb-1">제5조 (계정 및 탈퇴)</h2>
                <p>
                  이용자는 언제든지 서비스 내 설정을 통해 회원 탈퇴를 요청할 수 있으며, 탈퇴 시
                  관계 법령에서 정한 경우를 제외하고 지체없이 개인정보를 파기합니다.
                </p>
              </section>
            </div>

            <label className="flex items-start gap-2.5 mt-5 cursor-pointer select-none">
              <div
                onClick={handleAgree}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-all mt-0.5 cursor-pointer shrink-0 ${
                  checked ? "border-blue-500 bg-blue-500" : "border-border"
                }`}
              >
                {checked && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-sm text-foreground">
                위 이용약관 및 개인정보처리방침을 모두 확인했으며 이에 동의합니다.
              </span>
            </label>
            <p className="text-xs text-muted-foreground mt-2 ml-[30px]">
              체크하면 회원가입 화면으로 자동으로 돌아갑니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
