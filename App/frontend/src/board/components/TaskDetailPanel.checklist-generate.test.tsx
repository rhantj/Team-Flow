import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { Task } from "../libs/types/task";
import { generateChecklist } from "../libs/utils/checklistApi";

vi.mock("../../global/hooks/useAuth", () => ({
  useAuth: () => ({ currentProjectId: 1, currentProject: { projectId: 1, projectTitle: "데모", role: "팀장" } }),
}));

vi.mock("../libs/utils/checklistApi", () => ({
  fetchChecklist: vi.fn().mockResolvedValue([{ id: "1", label: "기존 항목", done: false }]),
  createChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  generateChecklist: vi.fn().mockResolvedValue([
    { id: "2", label: "API 명세 확정", done: false },
    { id: "3", label: "단위 테스트 작성", done: false },
  ]),
}));

vi.mock("../libs/utils/taskCommentApi", () => ({
  fetchTaskComments: vi.fn().mockResolvedValue([]),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
}));

vi.mock("../libs/utils/activityApi", () => ({
  fetchTaskActivity: vi.fn().mockResolvedValue([]),
}));

function makeTask(): Task {
  return {
    id: "TF-01", title: "테스트 업무", status: "todo", priority: "medium",
    assignee: "1", dueDate: "2026-07-20", labels: [], category: "backend", position: 0,
  };
}

describe("TaskDetailPanel 체크리스트 자동 생성", () => {
  it("appends generated items to the existing checklist", async () => {
    const onShowToast = vi.fn();
    render(
      <TaskDetailPanel
        task={makeTask()}
        onClose={vi.fn()}
        onQuickAction={vi.fn()}
        onShowToast={onShowToast}
        onDeleteTask={vi.fn()}
        onEditTask={vi.fn()}
        onOpenWorkResult={vi.fn()}
      />
    );

    expect(await screen.findByText("기존 항목")).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("더보기"));
    await userEvent.click(await screen.findByText("체크리스트 자동 생성"));

    expect(await screen.findByText("API 명세 확정")).toBeInTheDocument();
    expect(await screen.findByText("단위 테스트 작성")).toBeInTheDocument();
    expect(screen.getByText("기존 항목")).toBeInTheDocument();
    expect(generateChecklist).toHaveBeenCalledWith("TF-01", 1);
    expect(onShowToast).toHaveBeenCalledWith("체크리스트 2개를 생성했습니다.");
  });
});
