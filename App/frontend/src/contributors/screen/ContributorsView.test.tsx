import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContributorsView } from "./ContributorsView";
import { fetchTasks } from "../../board/libs/utils/taskApi";
import { fetchAttendanceSummary, fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import { fetchContributionScore, fetchContributionReport } from "../libs/utils/contributorsApi";
import type { Task } from "../../board/libs/types/task";

vi.mock("../../global/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, email: "reviewer@university.ac.kr", name: "박현수 교수" },
    projectRoles: [{ projectId: 1, projectTitle: "스마트 주차 관리 시스템", role: "심사자" }],
    currentProjectId: 1,
    logout: vi.fn(),
  }),
}));

vi.mock("../../board/libs/utils/taskApi", () => ({
  fetchTasks: vi.fn(),
}));

vi.mock("../../meetings/libs/utils/meetingAiApi", () => ({
  fetchAttendanceSummary: vi.fn(),
  fetchAttendanceDetail: vi.fn(),
}));

vi.mock("../libs/utils/contributorsApi", () => ({
  fetchContributionScore: vi.fn(),
  fetchContributionReport: vi.fn(),
}));

function makeTask(id: string, assignee: string, status: Task["status"], title: string): Task {
  return { id, title, status, priority: "medium", assignee, dueDate: "", labels: [], category: "backend", position: 0 };
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/contributors"]}>
      <ContributorsView />
    </MemoryRouter>
  );
}

describe("ContributorsView drilldown panels", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchContributionScore).mockResolvedValue({ members: [], note: null });
    vi.mocked(fetchAttendanceSummary).mockResolvedValue([]);
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask("A", "1", "done", "AI 모델 학습 파이프라인 구축"),
      makeTask("B", "1", "inprogress", "데이터 전처리 스크립트 작성"),
      makeTask("C", "2", "done", "다른 팀원의 업무"),
    ]);
  });

  it("opens the task drilldown panel with only the clicked member's tasks when '업무 수행' cell is clicked", async () => {
    renderView();
    const user = userEvent.setup();

    await waitFor(() => expect(fetchTasks).toHaveBeenCalled());
    // "김민준"은 테이블 행/사이드바 카드/메인 그리드 요약 카드 3곳에 나타나므로, 테이블 행에서만
    // 쓰이는 클래스("text-sm")로 좁혀서 정확히 그 행을 찾은 뒤 그 안에서만 셀을 조회한다.
    const nameCell = screen.getByText("김민준", { selector: ".text-sm" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const taskCell = within(row).getByText("8");
    await user.click(taskCell);

    await waitFor(() => expect(screen.getByText("AI 모델 학습 파이프라인 구축")).toBeInTheDocument());
    expect(screen.getByText("데이터 전처리 스크립트 작성")).toBeInTheDocument();
    expect(screen.queryByText("다른 팀원의 업무")).not.toBeInTheDocument();
  });

  it("opens the meeting drilldown panel and calls fetchAttendanceDetail when '회의 참여' cell is clicked", async () => {
    vi.mocked(fetchAttendanceDetail).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
    ]);
    renderView();
    const user = userEvent.setup();

    const nameCell = screen.getByText("김민준", { selector: ".text-sm" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const meetingCell = within(row).getByText("6회");
    await user.click(meetingCell);

    await waitFor(() => expect(screen.getByText("12.10 팀 정기 회의")).toBeInTheDocument());
    expect(fetchAttendanceDetail).toHaveBeenCalledWith("1", 1);
  });
});
