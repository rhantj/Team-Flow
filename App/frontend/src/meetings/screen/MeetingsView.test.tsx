import { describe, expect, it } from "vitest";
import { buildGeneratedTodos } from "./MeetingsView";
import type { MeetingAiResult } from "../libs/types/meetingAiTypes";

const baseResult = (assignee_id: string | null): MeetingAiResult => ({
  summary: "요약",
  decisions: [],
  risks: [],
  keywords: [],
  meeting_meta: { title: "정기회의", meeting_date: "2026-07-09", participants: ["김민준", "이서연", "박지수", "최동혁"] },
  todos: [
    {
      title: "인증과 권한 구조",
      description: "인증과 권한 구조는 제가 먼저 잡겠습니다.",
      assignee_candidate: "곽진아",
      assignee_id,
      due_date: "2026-07-12",
      priority: "HIGH",
      category: "BACKEND",
      needs_leader_review: assignee_id === null,
    },
  ],
});

describe("buildGeneratedTodos", () => {
  it("leaves the todo unassigned when the server returns a null assignee_id, without defaulting to any member", () => {
    const todos = buildGeneratedTodos(baseResult(null));

    expect(todos[0].assignee).toBe("");
    expect(todos[0].assigned).toBe(false);
  });

  it("trusts the server-provided assignee_id when present, without re-deriving it from assignee_candidate", () => {
    const todos = buildGeneratedTodos(baseResult("3"));

    expect(todos[0].assignee).toBe("3");
    expect(todos[0].assigned).toBe(true);
  });
});
