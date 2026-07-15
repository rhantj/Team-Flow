import { Suspense, useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Sparkles } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AIAssistant } from "../../../ai/screen/AIAssistant";
import type { Tab } from "../../../board/libs/types/task";
import { useAuth } from "../../hooks/useAuth";

const OPEN_AI_ASSISTANT_EVENT = "workflow-ai:open-ai-assistant";

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProjectRole } = useAuth();
  const [aiOpen, setAIOpen] = useState(false);

  useEffect(() => {
    const open = () => setAIOpen(true);
    window.addEventListener(OPEN_AI_ASSISTANT_EVENT, open);
    return () => window.removeEventListener(OPEN_AI_ASSISTANT_EVENT, open);
  }, []);

  const activeTab = (location.pathname.split("/").filter(Boolean)[0] ?? "dashboard") as Tab;
  const isJudge = currentProjectRole === "JUDGE";
  const isReadOnlyContent = isJudge && activeTab !== "contributors";

  const blockReadOnlyAction = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest("button, a, input, textarea, select, [role='button']");
    if (interactive) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <Sidebar active={activeTab} onSelect={(tab) => navigate(`/${tab}`)} onAI={() => setAIOpen(true)} />

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        {/* Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {isReadOnlyContent && (
            <div className="shrink-0 px-6 py-2.5 border-b border-violet-100 bg-violet-50 text-xs font-semibold text-violet-700">
              심사자 열람 전용 모드입니다. 프로젝트 정보는 확인만 가능하며 수정, 등록, 업로드 액션은 비활성화됩니다.
            </div>
          )}
          <div
            className="flex-1 min-h-0 overflow-hidden"
            onClickCapture={isReadOnlyContent ? blockReadOnlyAction : undefined}
            onKeyDownCapture={isReadOnlyContent ? blockReadOnlyAction : undefined}
          >
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">로딩 중...</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* AI floating button */}
      {!isJudge && !aiOpen && (
        <button onClick={() => setAIOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center text-white transition-transform hover:scale-105 z-40"
          style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* AI panel overlay */}
      {aiOpen && (
        <>
          <div className="fixed inset-0 bg-black/10 z-40" onClick={() => setAIOpen(false)} />
          <AIAssistant onClose={() => setAIOpen(false)} />
        </>
      )}
    </div>
  );
}
