import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeAction } from "./actionExecutor";
import { updateTaskPosition } from "../../../board/libs/utils/taskApi";
import { createTaskComment } from "../../../board/libs/utils/taskCommentApi";
import { fetchChecklist, updateChecklistItem } from "../../../board/libs/utils/checklistApi";
import type { ActionCard } from "../types/command";

vi.mock("../../../board/libs/utils/taskApi", () => ({ updateTaskPosition: vi.fn() }));
vi.mock("../../../board/libs/utils/taskCommentApi", () => ({ createTaskComment: vi.fn() }));
vi.mock("../../../board/libs/utils/checklistApi", () => ({
  fetchChecklist: vi.fn(),
  updateChecklistItem: vi.fn(),
}));

function card(overrides: Partial<ActionCard>): ActionCard {
  return {
    stepId: "0-abc",
    tool: "change_status",
    taskId: 37,
    title: "업무 상태 변경",
    summary: "요약",
    args: { to: "done" },
    ...overrides,
  };
}

describe("executeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the existing status API for change_status", async () => {
    vi.mocked(updateTaskPosition).mockResolvedValue({} as never);

    const result = await executeAction(card({}), 1);

    expect(result.ok).toBe(true);
    expect(updateTaskPosition).toHaveBeenCalledWith("37", "done", expect.any(Number), 1);
  });

  it("calls the existing comment API for add_comment", async () => {
    vi.mocked(createTaskComment).mockResolvedValue({} as never);

    const result = await executeAction(
      card({ tool: "add_comment", args: { content: "확인했습니다" } }),
      1
    );

    expect(result.ok).toBe(true);
    expect(createTaskComment).toHaveBeenCalledWith("37", "확인했습니다", 1);
  });

  it("reports failure with the server message instead of throwing", async () => {
    vi.mocked(updateTaskPosition).mockRejectedValue(new Error("권한이 없습니다"));

    const result = await executeAction(card({}), 1);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("권한이 없습니다");
  });

  it("refuses unknown tools without calling any API", async () => {
    const result = await executeAction(card({ tool: "drop_database" }), 1);

    expect(result.ok).toBe(false);
    expect(updateTaskPosition).not.toHaveBeenCalled();
  });

  it("refuses a card without a task id", async () => {
    const result = await executeAction(card({ taskId: null }), 1);

    expect(result.ok).toBe(false);
    expect(updateTaskPosition).not.toHaveBeenCalled();
  });

  it("toggles the matching checklist item", async () => {
    vi.mocked(fetchChecklist).mockResolvedValue([
      { id: 1, label: "코드 리뷰", done: false },
      { id: 2, label: "테스트 작성", done: false },
    ] as never);
    vi.mocked(updateChecklistItem).mockResolvedValue({} as never);

    const result = await executeAction(
      card({ tool: "toggle_checklist", args: { item: "테스트", done: true } }),
      1
    );

    expect(result.ok).toBe(true);
    expect(updateChecklistItem).toHaveBeenCalledWith("37", 2, { done: true }, 1);
  });

  it("refuses to guess when multiple checklist items partially match", async () => {
    vi.mocked(fetchChecklist).mockResolvedValue([
      { id: 1, label: "리뷰 요청", done: false },
      { id: 2, label: "리뷰 반영", done: false },
    ] as never);

    const result = await executeAction(
      card({ tool: "toggle_checklist", args: { item: "리뷰", done: true } }),
      1
    );

    expect(result.ok).toBe(false);
    expect(updateChecklistItem).not.toHaveBeenCalled();
  });

  it("prefers an exact label match over a partial one", async () => {
    vi.mocked(fetchChecklist).mockResolvedValue([
      { id: 1, label: "리뷰", done: false },
      { id: 2, label: "리뷰 반영", done: false },
    ] as never);
    vi.mocked(updateChecklistItem).mockResolvedValue({} as never);

    const result = await executeAction(
      card({ tool: "toggle_checklist", args: { item: "리뷰", done: true } }),
      1
    );

    expect(result.ok).toBe(true);
    expect(updateChecklistItem).toHaveBeenCalledWith("37", 1, { done: true }, 1);
  });

  it("refuses an empty checklist item instead of matching the first one", async () => {
    // item이 빈 문자열이면 label.includes("")가 항상 참이라 첫 항목을 잘못 토글할 수 있다.
    const result = await executeAction(
      card({ tool: "toggle_checklist", args: { item: "", done: true } }),
      1
    );

    expect(result.ok).toBe(false);
    expect(fetchChecklist).not.toHaveBeenCalled();
    expect(updateChecklistItem).not.toHaveBeenCalled();
  });
});
