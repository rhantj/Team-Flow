import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapView } from "./RoadmapView";

const fetchRoadmap = vi.fn();
const createRoadmapTask = vi.fn();
const createMilestone = vi.fn();
const moveRoadmapTask = vi.fn();

vi.mock("../../global/hooks/useAuth", () => ({
  useAuth: () => ({ currentProjectId: 1, currentProject: { projectId: 1, projectTitle: "WorkFlow AI", role: "팀장" } }),
}));

vi.mock("../libs/utils/roadmapApi", () => ({
  fetchRoadmap: (...args: unknown[]) => fetchRoadmap(...args),
  createRoadmapTask: (...args: unknown[]) => createRoadmapTask(...args),
  createMilestone: (...args: unknown[]) => createMilestone(...args),
  moveRoadmapTask: (...args: unknown[]) => moveRoadmapTask(...args),
}));

const response = {
  project: { id: "1", title: "WorkFlow AI", startDate: "2026-07-01", deadline: "2026-07-31" },
  milestones: [{
    id: "2",
    title: "통합 테스트",
    startDate: "2026-07-17",
    dueDate: "2026-07-28",
    taskCount: 1,
    doneCount: 0,
    progressPercent: 0,
    tasks: [{
      id: "10", milestoneId: "2", title: "E2E 테스트", category: "qa", status: "todo",
      assigneeId: null, assigneeName: null, startDate: "2026-07-21", dueDate: "2026-07-28",
      priority: "medium", position: 0,
    }],
  }],
  unassignedTasks: [],
};

function renderRoadmap() {
  return render(
    <MemoryRouter>
      <RoadmapView />
    </MemoryRouter>,
  );
}

describe("RoadmapView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRoadmap.mockResolvedValue(structuredClone(response));
    createRoadmapTask.mockResolvedValue({
      id: "11", milestoneId: "2", title: "API 연동 테스트", category: "other", status: "todo",
      assigneeId: null, assigneeName: null, startDate: "2026-07-22", dueDate: "2026-07-28",
      priority: "medium", position: 1,
    });
  });

  it("renders tasks grouped under their milestone", async () => {
    renderRoadmap();

    expect(await screen.findByText("통합 테스트")).toBeInTheDocument();
    expect(screen.getByText("E2E 테스트", { selector: ".block.text-xs" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "주" }));
    expect(screen.getByText("1주차")).toBeInTheDocument();
    expect(screen.getByText("2주차")).toBeInTheDocument();
  });

  it("creates a task directly inside the selected milestone", async () => {
    renderRoadmap();
    await screen.findByText("통합 테스트");

    fireEvent.click(screen.getByRole("button", { name: /업무 바로 추가/ }));
    const input = screen.getByPlaceholderText("업무명 입력 후 Enter");
    fireEvent.change(input, { target: { value: "API 연동 테스트" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(createRoadmapTask).toHaveBeenCalledWith(1, "2", { title: "API 연동 테스트" }));
    expect(await screen.findByText("API 연동 테스트", { selector: ".block.text-xs" })).toBeInTheDocument();
  });
});

describe("RoadmapView project schedule guidance", () => {
  it("warns about missing project dates and collapses unassigned tasks", async () => {
    vi.clearAllMocks();
    fetchRoadmap.mockResolvedValue({
      ...structuredClone(response),
      project: { ...response.project, startDate: null, deadline: null },
      milestones: [],
      unassignedTasks: [{
        id: "99", milestoneId: null, title: "Legacy task", category: "other", status: "todo",
        assigneeId: null, assigneeName: null, startDate: null, dueDate: "2025-12-28",
        priority: "medium", position: 0,
      }],
    });

    renderRoadmap();

    expect(await screen.findByText(/프로젝트 시작일과 종료일이 없어/)).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /새 단계/ })) {
      expect(button).toBeDisabled();
    }
    expect(screen.queryByText("Legacy task")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /단계 미지정/ }));
    expect(await screen.findByText("Legacy task")).toBeInTheDocument();
    expect(screen.getByText(/표시 범위 밖/)).toBeInTheDocument();
  });
});
