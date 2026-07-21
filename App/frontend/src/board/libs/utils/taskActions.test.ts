import { describe, expect, it } from "vitest";
import { STATUS_ACTIONS, visibleSecondaryActions, quickMoveTargetStatus } from "./taskActions";

describe("visibleSecondaryActions", () => {
  const doneSecondary = STATUS_ACTIONS.done.filter((a) => !a.primary);

  it("hides 결과물 보기 and AI 완료 요약 regardless of role", () => {
    const labels = visibleSecondaryActions(doneSecondary, true).map((a) => a.label);
    expect(labels).not.toContain("결과물 보기");
    expect(labels).not.toContain("AI 완료 요약");
  });

  it("shows 팀장 피드백 for leaders", () => {
    const labels = visibleSecondaryActions(doneSecondary, true).map((a) => a.label);
    expect(labels).toEqual(["팀장 피드백", "다시 열기"]);
  });

  it("hides 팀장 피드백 for non-leaders", () => {
    const labels = visibleSecondaryActions(doneSecondary, false).map((a) => a.label);
    expect(labels).toEqual(["다시 열기"]);
  });

  it("hides AI/PR/의존관계/중복 항목 that need out-of-scope integrations", () => {
    const todoSecondary = STATUS_ACTIONS.todo.filter((a) => !a.primary);
    const inprogressSecondary = STATUS_ACTIONS.inprogress.filter((a) => !a.primary);
    const blockedSecondary = STATUS_ACTIONS.blocked.filter((a) => !a.primary);

    expect(visibleSecondaryActions(todoSecondary, false).map((a) => a.label)).toEqual(["담당자 변경", "시작 알림"]);
    expect(visibleSecondaryActions(inprogressSecondary, false).map((a) => a.label)).toEqual(["블로커 등록", "진행상황 요청"]);
    expect(visibleSecondaryActions(blockedSecondary, false).map((a) => a.label)).toEqual(["긴급 알림", "담당자 재배정"]);
  });
});

describe("quickMoveTargetStatus", () => {
  it("returns inprogress when label is 다시 열기 and status is done", () => {
    expect(quickMoveTargetStatus("다시 열기", "done")).toBe("inprogress");
  });

  it("returns blocked when label is 블로커 등록 and status is inprogress", () => {
    expect(quickMoveTargetStatus("블로커 등록", "inprogress")).toBe("blocked");
  });

  it("returns null for other labels", () => {
    expect(quickMoveTargetStatus("팀장 피드백", "done")).toBeNull();
  });

  it("returns null when status doesn't match the label's expected origin", () => {
    expect(quickMoveTargetStatus("다시 열기", "inprogress")).toBeNull();
    expect(quickMoveTargetStatus("블로커 등록", "done")).toBeNull();
  });
});
