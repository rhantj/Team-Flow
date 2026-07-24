import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useReviewerProjects } from "./useReviewerProjects";
import { fetchReviewerProjects } from "../utils/reviewerApi";
import type { ReviewerProject } from "../utils/reviewerApi";

vi.mock("../utils/reviewerApi", () => ({
  fetchReviewerProjects: vi.fn(),
}));

function makeProject(projectId: number, title: string): ReviewerProject {
  return {
    projectId, title, type: "캡스톤디자인", leaderName: "김민준", memberCount: 4,
    progressPercent: 71, evalStatus: "pending", deliverablesSubmitted: 0, deliverablesTotal: 0,
    githubConnected: false,
  };
}

describe("useReviewerProjects", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the reviewer's assigned projects", async () => {
    vi.mocked(fetchReviewerProjects).mockResolvedValue([makeProject(1, "스마트 주차 관리 시스템")]);

    const { result } = renderHook(() => useReviewerProjects());

    expect(result.current.loadState).toBe("loading");
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.projects.map((p) => p.title)).toEqual(["스마트 주차 관리 시스템"]);
  });

  it("sets error state when the fetch fails", async () => {
    vi.mocked(fetchReviewerProjects).mockRejectedValue(new Error("네트워크 오류"));

    const { result } = renderHook(() => useReviewerProjects());

    await waitFor(() => expect(result.current.loadState).toBe("error"));
  });

  it("reload() re-fetches and can recover from an error", async () => {
    vi.mocked(fetchReviewerProjects)
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValueOnce([makeProject(2, "AI 기반 식단 추천 앱")]);

    const { result } = renderHook(() => useReviewerProjects());

    await waitFor(() => expect(result.current.loadState).toBe("error"));
    result.current.reload();
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.projects[0].title).toBe("AI 기반 식단 추천 앱");
  });
});
