import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AIAssistant } from "./AIAssistant";

vi.mock("../../global/hooks/useAuth", () => ({
  useAuth: () => ({ currentProjectId: 1 }),
}));

describe("AIAssistant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial assistant greeting", () => {
    render(<AIAssistant onClose={() => {}} />);
    expect(screen.getByText(/WorkFlow AI 어시스턴트/)).toBeInTheDocument();
  });

  it("shows loading indicator then renders answer with source badge", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          answer: "실제 RAG 답변",
          sources: [{ source_type: "meeting", source_id: 3, content_snippet: "요약", similarity: 0.8 }],
        },
      }),
    }) as unknown as typeof fetch;

    render(<AIAssistant onClose={() => {}} />);
    const textbox = screen.getByPlaceholderText("프로젝트에 대해 무엇이든 물어보세요...");
    await userEvent.type(textbox, "오늘 할 일 알려줘");
    await userEvent.click(screen.getByRole("button", { name: "전송" }));

    await waitFor(() => expect(screen.getByText("실제 RAG 답변")).toBeInTheDocument());
    expect(screen.getByText(/출처: 회의록 #3/)).toBeInTheDocument();
  });

  it("shows fallback message on API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: { code: "RAG_UNAVAILABLE", message: "실패" } }),
    }) as unknown as typeof fetch;

    render(<AIAssistant onClose={() => {}} />);
    const textbox = screen.getByPlaceholderText("프로젝트에 대해 무엇이든 물어보세요...");
    await userEvent.type(textbox, "질문{enter}");

    await waitFor(() => expect(screen.getByText("일시적으로 답변을 생성할 수 없습니다.")).toBeInTheDocument());
  });
});
