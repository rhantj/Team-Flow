import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAiInsight } from "./useAiInsight";
import { apiFetch } from "../../../global/api/apiClient";

vi.mock("../../../global/api/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("useAiInsight", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not ask until ready is true", () => {
    renderHook(() => useAiInsight(1, "질문", false));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("asks exactly once when ready becomes true, and reports the answer", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ answer: "추천 답변", sources: [] });

    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useAiInsight(1, "질문입니다", ready),
      { initialProps: { ready: false } }
    );

    expect(result.current.loading).toBe(false);
    rerender({ ready: true });

    await waitFor(() => expect(result.current.text).toBe("추천 답변"));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    rerender({ ready: true });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  });

  it("does not ask when projectId is null", () => {
    renderHook(() => useAiInsight(null, "질문", true));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("surfaces an error message when the query fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("일시적으로 답변을 생성할 수 없습니다"));

    const { result } = renderHook(() => useAiInsight(1, "질문", true));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.text).toBeNull();
  });

  it("caps concurrent auto-queries when many instances become ready at once", async () => {
    // BlockersPage처럼 useAiInsight를 쓰는 카드가 여러 개 동시에 렌더되는 상황을 흉내낸다.
    // apiFetch가 즉시 resolve되지 않게 해서, 동시에 실행 중인 호출 수가 상한을 넘는지 확인한다.
    let resolveCount = 0;
    const pendingResolvers: Array<() => void> = [];
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise(resolve => {
          pendingResolvers.push(() => {
            resolveCount += 1;
            resolve({ answer: `답변 ${resolveCount}`, sources: [] });
          });
        })
    );

    const CARD_COUNT = 5;
    renderHook(() => {
      for (let i = 0; i < CARD_COUNT; i += 1) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useAiInsight(1, `질문 ${i}`, true);
      }
    });

    // 동시 실행 상한(2)을 넘는 호출이 즉시 나가지 않아야 한다.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch).not.toHaveBeenCalledTimes(3);

    // 앞선 요청이 끝나면 대기열에서 다음 요청이 순서대로 실행된다.
    pendingResolvers[0]();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));

    pendingResolvers[1]();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(4));

    pendingResolvers[2]();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(5));

    pendingResolvers[3]();
    pendingResolvers[4]();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(5));
  });
});
