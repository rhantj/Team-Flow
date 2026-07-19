import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { CHAT_INIT, QUICK_QUESTIONS } from "../libs/mock/chat";
import { useRagQuery } from "../libs/hooks/useRagQuery";
import { useAuth } from "../../global/hooks/useAuth";
import type { ChatMsg } from "../libs/types/chat";

const NO_PROJECT_MESSAGE = "아직 연결된 프로젝트가 없습니다. 프로젝트를 만들고 회의록을 업로드한 뒤 다시 질문해주세요.";

export function AIAssistant({ onClose }: { onClose: () => void }) {
  const { currentProjectId } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>(CHAT_INIT.map(m => ({ role: m.role as "assistant", content: m.content })));
  const [input, setInput] = useState("");
  const { status, answer, error, ask } = useRagQuery();
  const loading = status === "loading";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (status === "success" && answer) {
      setMessages(prev => [...prev, { role: "assistant", content: answer.content, sources: answer.sources }]);
    }
    if (status === "error" && error) {
      setMessages(prev => [...prev, { role: "assistant", content: error }]);
    }
  }, [status, answer, error]);

  const send = (text: string) => {
    if (!text.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    if (currentProjectId == null) {
      setMessages(prev => [...prev, { role: "assistant", content: NO_PROJECT_MESSAGE }]);
      setTimeout(() => setInput(""), 0);
      return;
    }
    ask(currentProjectId, text);
    // 한글 등 IME 조합 완료 이벤트가 keydown 이후 뒤늦게 들어와 입력창을 다시 채우는 것을 피하기 위해
    // 조합 이벤트가 먼저 처리되도록 한 틱 미뤄서 비운다.
    setTimeout(() => setInput(""), 0);
  };

  return (
    <div className="fixed right-0 top-0 h-full w-[380px] shadow-2xl flex flex-col z-50" style={{ background: "#FFFFFF", fontFamily: "'Inter', 'Noto Sans KR', sans-serif", borderLeft: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">AI 어시스턴트</div>
            <div className="text-[10px] text-purple-200">스마트 주차 관리 시스템</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Quick questions */}
      <div className="px-4 py-3 border-b border-border bg-secondary/40 flex gap-2 overflow-x-auto scrollbar-hide">
        {QUICK_QUESTIONS.map(q => (
          <button key={q} onClick={() => send(q)}
            className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors text-muted-foreground whitespace-nowrap">
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className="max-w-[85%]">
              <div className={`text-sm rounded-2xl px-4 py-3 whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "text-white rounded-br-sm" : "text-foreground bg-secondary rounded-bl-sm"}`}
                style={m.role === "user" ? { background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" } : {}}>
                {m.content}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {m.sources.map((s, si) => (
                    <span key={si} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                      출처: {s.sourceType === "meeting" ? "회의록" : "업무"} #{s.sourceId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex items-end gap-2">
          <div className="flex-1 rounded-xl border border-border bg-input-background px-3 py-2.5">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="프로젝트에 대해 무엇이든 물어보세요..."
              rows={1}
              className="w-full text-sm bg-transparent outline-none resize-none text-foreground placeholder-muted-foreground"
            />
          </div>
          <button onClick={() => send(input)} disabled={!input.trim() || loading} aria-label="전송"
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40 text-white"
            style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground text-center mt-2">회의록·To-Do·GitHub 기록 기반으로 답변합니다</div>
      </div>
    </div>
  );
}
