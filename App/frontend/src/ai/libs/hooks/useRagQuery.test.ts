import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRagQuery } from "./useRagQuery";
import { apiFetch } from "../../../global/api/apiClient";

vi.mock("../../../global/api/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("useRagQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns answer and sources on success", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      type: "answer",
      message: "테스트 답변",
      sources: [{ source_type: "meeting", source_id: 1, content_snippet: "요약", similarity: 0.9 }],
    });

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "질문입니다");
    });

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(apiFetch).toHaveBeenCalledWith("/ai/assistant/command", {
      method: "POST",
      body: JSON.stringify({ project_id: 1, question: "질문입니다", history: [] }),
      signal: expect.any(AbortSignal),
    });
    expect(result.current.answer?.content).toBe("테스트 답변");
    expect(result.current.answer?.sources).toHaveLength(1);
  });

  it("posts to the assistant command endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ type: "answer", message: "답변", sources: [] });

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "내 업무가 뭐야?");
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/ai/assistant/command");
    expect(result.current.answer?.content).toBe("답변");
  });

  it("sends only the last 6 history messages and strips non-conversational fields", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ type: "answer", message: "답변", sources: [] });

    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `메시지${i}`,
      sources: [{ sourceType: "task" as const, sourceId: i, contentSnippet: "x", similarity: 0.5 }],
    }));

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "그 업무는 언제까지야?", history);
    });

    await waitFor(() => expect(result.current.status).toBe("success"));

    const sentBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
    expect(sentBody).toEqual({
      project_id: 1,
      question: "그 업무는 언제까지야?",
      history: [
        { role: "user", content: "메시지4" },
        { role: "assistant", content: "메시지5" },
        { role: "user", content: "메시지6" },
        { role: "assistant", content: "메시지7" },
        { role: "user", content: "메시지8" },
        { role: "assistant", content: "메시지9" },
      ],
    });
  });

  it("truncates each history message to 1000 characters to avoid server INVALID_HISTORY rejection", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ type: "answer", message: "답변", sources: [] });

    const longContent = "가".repeat(1500);
    const history = [{ role: "assistant" as const, content: longContent }];

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "그건 무슨 뜻이야?", history);
    });

    await waitFor(() => expect(result.current.status).toBe("success"));

    const sentBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
    expect(sentBody.history).toEqual([{ role: "assistant", content: "가".repeat(1000) }]);
  });

  it("sends an empty history array when there is no prior conversation", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ type: "answer", message: "답변", sources: [] });

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "내 업무가 뭐야?", []);
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    const sentBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
    expect(sentBody).toEqual({ project_id: 1, question: "내 업무가 뭐야?", history: [] });
  });

  it("sets error state when request fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("실패"));

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "질문입니다");
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeTruthy();
  });
});
