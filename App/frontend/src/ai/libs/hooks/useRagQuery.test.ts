import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRagQuery } from "./useRagQuery";

describe("useRagQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns answer and sources on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          answer: "테스트 답변",
          sources: [{ source_type: "meeting", source_id: 1, content_snippet: "요약", similarity: 0.9 }],
        },
      }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "질문입니다");
    });

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.answer?.content).toBe("테스트 답변");
    expect(result.current.answer?.sources).toHaveLength(1);
  });

  it("sets error state when request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: { code: "RAG_UNAVAILABLE", message: "실패" } }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "질문입니다");
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeTruthy();
  });
});
