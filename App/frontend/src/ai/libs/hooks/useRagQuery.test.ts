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
      answer: "테스트 답변",
      sources: [{ source_type: "meeting", source_id: 1, content_snippet: "요약", similarity: 0.9 }],
    });

    const { result } = renderHook(() => useRagQuery());

    act(() => {
      result.current.ask(1, "질문입니다");
    });

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(apiFetch).toHaveBeenCalledWith("/ai/rag/query", {
      method: "POST",
      body: JSON.stringify({ project_id: 1, question: "질문입니다" }),
      signal: expect.any(AbortSignal),
    });
    expect(result.current.answer?.content).toBe("테스트 답변");
    expect(result.current.answer?.sources).toHaveLength(1);
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
