import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContributorsView } from "./ContributorsView";
import { fetchTasks } from "../../board/libs/utils/taskApi";
import { fetchAttendanceSummary, fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import { fetchContributionScore } from "../libs/utils/contributorsApi";
import { finalizeEvaluation, getProject, getProjectMembers } from "../../global/api/projectsApi";
import {
  getEvaluationScores,
  getEvaluationSettings,
  upsertEvaluationScore,
  upsertEvaluationSettings,
} from "../../global/api/evaluationApi";
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

vi.mock("../../global/api/projectsApi", () => ({
  getProject: vi.fn(),
  getProjectMembers: vi.fn(),
  finalizeEvaluation: vi.fn(),
}));

vi.mock("../../global/api/evaluationApi", () => ({
  getEvaluationScores: vi.fn(),
  upsertEvaluationScore: vi.fn(),
  getEvaluationSettings: vi.fn(),
  upsertEvaluationSettings: vi.fn(),
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
    vi.mocked(getProject).mockResolvedValue({
      id: 1, title: "스마트 주차 관리 시스템", type: null, deadline: null, description: null,
      startDate: null, midCheckDate: null, memberLimit: null, deliverables: null, techStack: null,
      goals: null, inviteCode: null, createdBy: null, memberCount: 1, taskProgress: 0,
      evalStatus: "EVALUATING",
    });
    vi.mocked(getProjectMembers).mockResolvedValue([
      { userId: 1, name: "김민준", email: "kim@test.com", role: "팀장" },
    ]);
    vi.mocked(fetchContributionScore).mockResolvedValue({
      members: [
        {
          assigneeId: "1", workloadComponent: 17.5, taskComponent: 80.0, meetingComponent: 80.0,
          contributionScore: 60.0, anomalyType: "배정량 불균형", taskCountActiveRel: 0.3, taskCountTotalRel: 0.3,
          difficultyAvgRel: 0.9, overdueCount: 0,
        },
      ],
      note: null,
      teamMeanCompletion: 0.6,
    });
    vi.mocked(fetchAttendanceSummary).mockResolvedValue([]);
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask("A", "1", "done", "AI 모델 학습 파이프라인 구축"),
      makeTask("B", "1", "inprogress", "데이터 전처리 스크립트 작성"),
      makeTask("C", "2", "done", "다른 팀원의 업무"),
    ]);
    vi.mocked(getEvaluationScores).mockResolvedValue([]);
    vi.mocked(upsertEvaluationScore).mockResolvedValue({
      projectId: 1, userId: 1, score: 60, isPublic: true, reviewerScore: null, grade: null,
    });
    vi.mocked(getEvaluationSettings).mockResolvedValue({ projectId: 1, contributionRatio: 40 });
    vi.mocked(upsertEvaluationSettings).mockResolvedValue({ projectId: 1, contributionRatio: 40 });
  });

  it("opens the task drilldown panel with only the clicked member's tasks when '업무 수행' cell is clicked, computed from real assigned tasks", async () => {
    renderView();
    const user = userEvent.setup();

    await waitFor(() => expect(fetchTasks).toHaveBeenCalled());
    // "김민준"은 테이블 행/사이드바 카드/메인 그리드 요약 카드 3곳에 나타나므로, 테이블 행에서만
    // 쓰이는 클래스("text-sm")로 좁혀서 정확히 그 행을 찾은 뒤 그 안에서만 셀을 조회한다.
    const nameCell = await screen.findByText("김민준", { selector: ".text-sm:not(.calculator-row-name)" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    // mock task 목록 중 assignee가 "1"(김민준)인 업무는 A(done)/B(inprogress) 2건 — done은 1건.
    // "1"만으로는 순위 배지("1위")와 텍스트가 겹치므로 "/2"(todoTotal)로 고유하게 찾는다.
    const taskCell = (await within(row).findByText("/2")).closest("button") as HTMLElement;
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

    // fetchAttendanceSummary가 빈 배열이면 회의 참여 열은 실제 참석 횟수(mock 세팅상 0회)를 보여준다.
    const nameCell = await screen.findByText("김민준", { selector: ".text-sm:not(.calculator-row-name)" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const meetingCell = await within(row).findByText("0회");
    await user.click(meetingCell);

    await waitFor(() => expect(screen.getByText("12.10 팀 정기 회의")).toBeInTheDocument());
    expect(fetchAttendanceDetail).toHaveBeenCalledWith("1", 1);
  });

  it("opens the workload drilldown panel without a new fetch when '업무 편중도' cell is clicked", async () => {
    renderView();
    const user = userEvent.setup();

    await waitFor(() => expect(fetchContributionScore).toHaveBeenCalled());
    const nameCell = await screen.findByText("김민준", { selector: ".text-sm:not(.calculator-row-name)" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const workloadCell = await within(row).findByText("17.5");
    await user.click(workloadCell);

    await waitFor(() => expect(screen.getByText("배정량 불균형")).toBeInTheDocument());
    expect(fetchContributionScore).toHaveBeenCalledTimes(1);
  });

  it("공개 배지를 클릭하면 upsertEvaluationScore를 호출해 서버에 공개 여부를 저장한다 (score는 보내지 않는다)", async () => {
    renderView();
    const user = userEvent.setup();

    const nameCell = await screen.findByText("김민준", { selector: ".text-sm:not(.calculator-row-name)" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const toggleButton = await within(row).findByRole("button", { name: /비공개/ });
    await user.click(toggleButton);

    // score를 undefined로 보내야 학점 계산기가 저장한 총점을 덮어쓰지 않는다 (회귀 테스트).
    await waitFor(() => expect(upsertEvaluationScore).toHaveBeenCalledWith(1, 1, undefined, true));
    expect(await within(row).findByRole("button", { name: /^공개$/ })).toBeInTheDocument();
  });

  it("upsertEvaluationScore가 실패하면 공개 상태를 되돌리고 에러 문구를 표시한다", async () => {
    vi.mocked(upsertEvaluationScore).mockRejectedValue(new Error("network error"));
    renderView();
    const user = userEvent.setup();

    const nameCell = await screen.findByText("김민준", { selector: ".text-sm:not(.calculator-row-name)" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const toggleButton = await within(row).findByRole("button", { name: /비공개/ });
    await user.click(toggleButton);

    await waitFor(() => expect(screen.getByText("공개 여부를 저장하지 못했습니다.")).toBeInTheDocument());
    expect(await within(row).findByRole("button", { name: /비공개/ })).toBeInTheDocument();
  });
});

describe("ContributorsView 학점 계산기", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getProject).mockResolvedValue({
      id: 1, title: "스마트 주차 관리 시스템", type: null, deadline: null, description: null,
      startDate: null, midCheckDate: null, memberLimit: null, deliverables: null, techStack: null,
      goals: null, inviteCode: null, createdBy: null, memberCount: 1, taskProgress: 0,
      evalStatus: "EVALUATING",
    });
    vi.mocked(getProjectMembers).mockResolvedValue([
      { userId: 1, name: "김민준", email: "kim@test.com", role: "팀장" },
    ]);
    vi.mocked(fetchContributionScore).mockResolvedValue({
      members: [
        {
          assigneeId: "1", workloadComponent: 17.5, taskComponent: 80.0, meetingComponent: 80.0,
          contributionScore: 60.0, anomalyType: "배정량 불균형", taskCountActiveRel: 0.3, taskCountTotalRel: 0.3,
          difficultyAvgRel: 0.9, overdueCount: 0,
        },
      ],
      note: null,
      teamMeanCompletion: 0.6,
    });
    vi.mocked(fetchAttendanceSummary).mockResolvedValue([]);
    vi.mocked(fetchTasks).mockResolvedValue([]);
    vi.mocked(getEvaluationScores).mockResolvedValue([]);
    vi.mocked(upsertEvaluationScore).mockResolvedValue({
      projectId: 1, userId: 1, score: 78, isPublic: false, reviewerScore: 90, grade: "A+",
    });
    vi.mocked(getEvaluationSettings).mockResolvedValue({ projectId: 1, contributionRatio: 40 });
    vi.mocked(upsertEvaluationSettings).mockResolvedValue({ projectId: 1, contributionRatio: 70 });
  });

  it("기여 점수를 보여주고, 심사자 점수를 입력하면 비율(기여 40%/심사자 60%)로 총합을 계산한다", async () => {
    renderView();
    const user = userEvent.setup();

    const heading = await screen.findByText("학점 계산기");
    const aside = heading.closest("aside") as HTMLElement;
    // 기여 점수(60)가 학점 계산기 행에 표시된다.
    expect(await within(aside).findByText("60")).toBeInTheDocument();

    const reviewerScoreInput = within(aside).getByPlaceholderText("-");
    await user.type(reviewerScoreInput, "90");

    // 60 × 0.4 + 90 × 0.6 = 78.00 (기본 비율 40%/60%, 기여 점수는 mock contributionScore 60)
    await waitFor(() => expect(within(aside).getByText("78.00")).toBeInTheDocument());
  });

  it("학점을 선택하고 저장 버튼을 누르면 upsertEvaluationScore가 총합/심사자점수/학점을 담아 호출된다", async () => {
    renderView();
    const user = userEvent.setup();

    const heading = await screen.findByText("학점 계산기");
    const aside = heading.closest("aside") as HTMLElement;

    const reviewerScoreInput = within(aside).getByPlaceholderText("-");
    await user.type(reviewerScoreInput, "90");
    await waitFor(() => expect(within(aside).getByText("78.00")).toBeInTheDocument());

    const gradeSelect = within(aside).getByRole("combobox");
    await user.selectOptions(gradeSelect, "A+");

    const saveButton = within(aside).getByRole("button", { name: "저장" });
    await user.click(saveButton);

    await waitFor(() =>
      expect(upsertEvaluationScore).toHaveBeenCalledWith(1, 1, 78, false, 90, "A+"),
    );
  });

  it("학점 계산기로 저장한 뒤 메인 테이블의 공개 토글을 눌러도 총점을 덮어쓰지 않는다 (회귀 테스트)", async () => {
    // 과거 버그: 공개 토글이 기여 점수(report.score)를 그대로 score로 재전송해,
    // 학점 계산기에서 저장한 최종 총점(78.00)이 기여 점수(60)로 되돌아갔다.
    renderView();
    const user = userEvent.setup();

    const heading = await screen.findByText("학점 계산기");
    const aside = heading.closest("aside") as HTMLElement;
    const reviewerScoreInput = within(aside).getByPlaceholderText("-");
    await user.type(reviewerScoreInput, "90");
    await waitFor(() => expect(within(aside).getByText("78.00")).toBeInTheDocument());

    const saveButton = within(aside).getByRole("button", { name: "저장" });
    await user.click(saveButton);
    await waitFor(() =>
      expect(upsertEvaluationScore).toHaveBeenCalledWith(1, 1, 78, false, 90, undefined),
    );

    vi.mocked(upsertEvaluationScore).mockClear();

    const nameCell = await screen.findByText("김민준", { selector: ".text-sm:not(.calculator-row-name)" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const toggleButton = await within(row).findByRole("button", { name: /비공개/ });
    await user.click(toggleButton);

    // score 자리에 undefined가 전달되어야 서버가 기존 총점(78.00)을 그대로 유지한다.
    await waitFor(() =>
      expect(upsertEvaluationScore).toHaveBeenCalledWith(1, 1, undefined, true),
    );
  });

  it("점수 비율을 변경하고 포커스를 벗어나면 upsertEvaluationSettings를 호출해 저장한다", async () => {
    renderView();
    const user = userEvent.setup();

    const heading = await screen.findByText("학점 계산기");
    const aside = heading.closest("aside") as HTMLElement;
    await waitFor(() => expect(getEvaluationSettings).toHaveBeenCalledWith(1));

    const ratioInput = within(aside).getByDisplayValue("40");
    await user.clear(ratioInput);
    await user.type(ratioInput, "70");
    await user.tab();

    await waitFor(() => expect(upsertEvaluationSettings).toHaveBeenCalledWith(1, 70));
  });

  it("총합 정렬 버튼을 클릭하면 오름차순/내림차순으로 행 순서가 바뀐다", async () => {
    vi.mocked(getProjectMembers).mockResolvedValue([
      { userId: 1, name: "김민준", email: "kim@test.com", role: "팀장" },
      { userId: 2, name: "이서연", email: "lee@test.com", role: "팀원" },
    ]);
    vi.mocked(fetchContributionScore).mockResolvedValue({
      members: [
        {
          assigneeId: "1", workloadComponent: 17.5, taskComponent: 80.0, meetingComponent: 80.0,
          contributionScore: 30.0, anomalyType: "정상", taskCountActiveRel: 0.3, taskCountTotalRel: 0.3,
          difficultyAvgRel: 0.9, overdueCount: 0,
        },
        {
          assigneeId: "2", workloadComponent: 17.5, taskComponent: 80.0, meetingComponent: 80.0,
          contributionScore: 90.0, anomalyType: "정상", taskCountActiveRel: 0.3, taskCountTotalRel: 0.3,
          difficultyAvgRel: 0.9, overdueCount: 0,
        },
      ],
      note: null,
      teamMeanCompletion: 0.6,
    });

    renderView();
    const user = userEvent.setup();

    const heading = await screen.findByText("학점 계산기");
    const aside = heading.closest("aside") as HTMLElement;
    await waitFor(() => expect(within(aside).getByText("김민준")).toBeInTheDocument());

    // 두 행 모두 심사자 점수를 입력해 총합을 확정시킨다 —
    // 김민준: 30×0.4+50×0.6=42.00, 이서연: 90×0.4+50×0.6=66.00 → 이서연 총합이 더 크다.
    const reviewerScoreInputs = within(aside).getAllByPlaceholderText("-");
    await user.type(reviewerScoreInputs[0], "50");
    await user.type(reviewerScoreInputs[1], "50");
    await waitFor(() => expect(within(aside).getByText("66.00")).toBeInTheDocument());

    const getRowOrder = () =>
      within(aside)
        .getAllByText(/^(김민준|이서연)$/)
        .map((el) => el.textContent);

    // 초기(정렬 없음): 목록 순서(김민준 → 이서연) 그대로.
    expect(getRowOrder()).toEqual(["김민준", "이서연"]);

    const sortButton = within(aside).getByRole("button", { name: /총합/ });
    await user.click(sortButton); // asc: 총합이 작은 순 → 김민준(42.00), 이서연(66.00)
    expect(getRowOrder()).toEqual(["김민준", "이서연"]);

    await user.click(sortButton); // desc: 총합이 큰 순 → 이서연(66.00), 김민준(42.00)
    expect(getRowOrder()).toEqual(["이서연", "김민준"]);
  });
});
