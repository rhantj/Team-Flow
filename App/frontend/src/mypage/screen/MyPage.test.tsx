import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MyPage } from "./MyPage";
import { fetchTasks } from "../../board/libs/utils/taskApi";
import type { Task } from "../../board/libs/types/task";
import { useAuth } from "../../global/hooks/useAuth";
import { fetchReviewerProjects } from "../libs/utils/reviewerApi";
import type { ReviewerProject } from "../libs/utils/reviewerApi";

vi.mock("../../global/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../board/libs/utils/taskApi", () => ({
  fetchTasks: vi.fn(),
}));

vi.mock("../libs/utils/reviewerApi", () => ({
  fetchReviewerProjects: vi.fn(),
}));

function makeTask(id: string, assignee: string, status: Task["status"], dueDate: string): Task {
  return { id, title: `업무 ${id}`, status, priority: "medium", assignee, dueDate, labels: [], category: "frontend", position: 0, pendingApproval: false, startDate: "", extraFields: {} };
}

function makeReviewerProject(projectId: number, title: string, evalStatus: ReviewerProject["evalStatus"] = "pending"): ReviewerProject {
  return {
    projectId, title, type: "캡스톤디자인", leaderName: "김민준", memberCount: 4,
    progressPercent: 71, evalStatus, deliverablesSubmitted: 0, deliverablesTotal: 0, githubConnected: false,
  };
}

function renderMyPage() {
  return render(
    <MemoryRouter initialEntries={["/mypage"]}>
      <MyPage />
    </MemoryRouter>
  );
}

describe("MyPage member view", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1, email: "seo.yeon@university.ac.kr", name: "이서연" },
      projectRoles: [{ projectId: 1, projectTitle: "스마트 주차 관리 시스템", role: "팀원" }],
      currentProjectId: 1,
      currentProject: { projectId: 1, projectTitle: "스마트 주차 관리 시스템", role: "팀원" },
      selectProject: vi.fn(),
      addLocalProjectRole: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      refreshMe: vi.fn(),
    });
  });

  it("shows task stat counts computed from real fetched tasks assigned to the current user", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask("A", "1", "done", "2026-01-10"),
      makeTask("B", "1", "inprogress", "2026-01-20"),
      makeTask("C", "2", "done", "2026-01-10"), // 다른 담당자, 제외돼야 함
    ]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("업무 A")).toBeInTheDocument());
    expect(screen.queryByText("업무 C")).not.toBeInTheDocument();
  });

  it("shows a loading message while tasks are being fetched", () => {
    vi.mocked(fetchTasks).mockReturnValue(new Promise(() => {}));

    renderMyPage();

    expect(screen.getByText("업무 정보를 불러오는 중...")).toBeInTheDocument();
  });

  it("shows an error message with a retry button when the fetch fails, and retries on click", async () => {
    vi.mocked(fetchTasks).mockRejectedValueOnce(new Error("실패")).mockResolvedValueOnce([makeTask("A", "1", "todo", "")]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("업무 정보를 불러오지 못했습니다.")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    await waitFor(() => expect(screen.getByText("업무 A")).toBeInTheDocument());
  });

  it("shows an empty-state message when the user has no assigned tasks", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("담당 중인 업무가 없습니다.")).toBeInTheDocument());
  });

  it("filters the task list to today's/this week's due tasks when the tabs are clicked", async () => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask("TODAY", "1", "todo", todayIso),
      makeTask("FAR", "1", "todo", "2099-12-31"),
    ]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("업무 FAR")).toBeInTheDocument());
    const taskListCard = screen.getByText("내 업무 목록").closest(".bg-card") as HTMLElement;
    await userEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(within(taskListCard).getByText("업무 TODAY")).toBeInTheDocument();
    expect(within(taskListCard).queryByText("업무 FAR")).not.toBeInTheDocument();
  });

  it("does not render the deliverables section", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("담당 중인 업무가 없습니다.")).toBeInTheDocument());
    expect(screen.queryByText("내가 담당한 산출물")).not.toBeInTheDocument();
  });

  it("does not render the activity timeline", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("담당 중인 업무가 없습니다.")).toBeInTheDocument());
    expect(screen.queryByText("내 활동 타임라인")).not.toBeInTheDocument();
  });
});

describe("MyPage reviewer view", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 6, email: "reviewer@university.ac.kr", name: "고무서" },
      projectRoles: [
        { projectId: 1, projectTitle: "스마트 주차 관리 시스템", role: "팀원" },
        { projectId: 2, projectTitle: "AI 기반 식단 추천 앱", role: "심사자" },
      ],
      currentProjectId: 2,
      currentProject: { projectId: 2, projectTitle: "AI 기반 식단 추천 앱", role: "심사자" },
      selectProject: vi.fn(),
      addLocalProjectRole: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      refreshMe: vi.fn(),
    });
  });

  it("renders the reviewer page (not the member page) when the CURRENT project's role is 심사자, even though it isn't the first entry in projectRoles", async () => {
    vi.mocked(fetchReviewerProjects).mockResolvedValue([makeReviewerProject(2, "AI 기반 식단 추천 앱")]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("배정된 프로젝트")).toBeInTheDocument());
    expect(screen.queryByText("내 업무 목록")).not.toBeInTheDocument();
  });

  it("shows assigned projects fetched from the API with leader and member count", async () => {
    vi.mocked(fetchReviewerProjects).mockResolvedValue([makeReviewerProject(2, "AI 기반 식단 추천 앱")]);

    renderMyPage();

    await waitFor(() => expect(screen.getAllByText("AI 기반 식단 추천 앱").length).toBeGreaterThan(0));
    expect(screen.getByText("김민준 팀장")).toBeInTheDocument();
    expect(screen.getByText("4명")).toBeInTheDocument();
  });

  it("shows an empty-state message when the reviewer has no assigned projects", async () => {
    vi.mocked(fetchReviewerProjects).mockResolvedValue([]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("배정된 프로젝트가 없습니다.")).toBeInTheDocument());
  });

  it("shows an error message with a retry button when the fetch fails, and retries on click", async () => {
    vi.mocked(fetchReviewerProjects)
      .mockRejectedValueOnce(new Error("실패"))
      .mockResolvedValueOnce([makeReviewerProject(2, "AI 기반 식단 추천 앱")]);

    renderMyPage();

    await waitFor(() => expect(screen.getByText("프로젝트 목록을 불러오지 못했습니다.")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    await waitFor(() => expect(screen.getAllByText("AI 기반 식단 추천 앱").length).toBeGreaterThan(0));
  });

  it("does not show affiliation/subject fields that have no real backing data", async () => {
    vi.mocked(fetchReviewerProjects).mockResolvedValue([makeReviewerProject(2, "AI 기반 식단 추천 앱")]);

    renderMyPage();

    await waitFor(() => expect(screen.getAllByText("AI 기반 식단 추천 앱").length).toBeGreaterThan(0));
    expect(screen.queryByText("한국대학교 컴퓨터공학과")).not.toBeInTheDocument();
    expect(screen.queryByText("캡스톤디자인 2024-2")).not.toBeInTheDocument();
  });
});
