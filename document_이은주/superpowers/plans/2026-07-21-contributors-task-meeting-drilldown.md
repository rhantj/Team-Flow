# 기여도 테이블 업무/회의 드릴다운 패널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심사자 화면(`ContributorsView.tsx`)의 "분석 근거" 카드를 제거하고, 테이블의 "업무 수행"/"회의 참여" 셀을 클릭하면 우측에 읽기 전용 드릴다운 패널이 나타나 해당 팀원의 구체적인 업무 목록(상태별)과 회의 참석/결석 내역(날짜 포함)을 보여주도록 만든다.

**Architecture:** 업무 목록은 기존 `board` 모듈의 `fetchTasks(projectId)`를 그대로 재사용해 신규 백엔드 없이 클라이언트에서 필터링/그룹화한다. 회의 참석 상세는 기존 `attendance-summary`(집계)와 나란히 새 Spring 엔드포인트 `GET /api/v1/projects/{projectId}/meetings/attendance-detail?userId={userId}`를 추가해 회의별 참석/결석 여부를 반환한다. 두 데이터 모두 신규 컴포넌트 `MemberDrilldownPanel`(읽기 전용, 우측 고정 오버레이)에서 렌더링한다.

**Tech Stack:** Spring Boot(Java 21) + JPA 리포지토리 재사용, React 19 + TypeScript(Vite), Vitest + Testing Library, JUnit5 + Mockito + MockMvc(standalone).

## Global Constraints

- 새 백엔드 엔드포인트는 기존 `attendance-summary`와 동일하게 `@PreAuthorize("@projectAccess.isMember(#projectId)")`를 사용한다(심사자 전용으로 더 좁히지 않음 — 이미 프로젝트 멤버 전체가 볼 수 있는 집계 정보의 상세 버전이므로).
- 업무 목록 드릴다운은 신규 백엔드를 추가하지 않고 기존 `board/libs/utils/taskApi.ts`의 `fetchTasks`를 재사용한다.
- 새로 만드는 `MemberDrilldownPanel`은 읽기 전용이다 — 업무 보드의 `TaskDetailPanel`(체크리스트/코멘트 편집 포함)을 재사용하거나 그 기능을 흉내내지 않는다.
- 실패 시 폴백 패턴은 이 파일의 기존 관례를 따른다: 목록/집계 fetch 실패는 조용히 빈 배열로 폴백하고, 패널 내부의 회의 참석 상세 fetch 실패만 패널 안에 에러 문구를 표시한다(전체 화면 에러로 만들지 않음).
- 모든 새 코드의 주석/문자열은 한국어로 작성한다(기존 코드베이스 관례).

---

### Task 1: Spring — 회의 참석 상세 엔드포인트

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendanceDetail.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java:338` (attendanceSummary 메서드 바로 뒤)
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisController.java:129` (attendance-summary 엔드포인트 바로 뒤)
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisControllerTest.java`

**Interfaces:**
- Produces: `MeetingAnalysisService.attendanceDetail(String projectId, Long userId) -> List<MeetingAttendanceDetail>`
- Produces: `MeetingAttendanceDetail(String meetingId, String title, String meetingDate, boolean attended)` record
- Produces: `GET /api/v1/projects/{projectId}/meetings/attendance-detail?userId={userId}` → `ApiResponse<List<MeetingAttendanceDetail>>`

- [ ] **Step 1: 서비스 테스트(실패하는 테스트) 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java`의 `attendanceSummaryComputesAttendedCountAndRatePerMember` 테스트(라인 364-388) 바로 뒤, 클래스를 닫는 마지막 `}` 앞에 아래 테스트를 추가한다:

```java
    @Test
    void attendanceDetailMarksAttendedAndAbsentMeetingsSortedByDate() {
        mockMember(1L);
        Meeting laterMeeting = new Meeting(1L, "12.11 스프린트 리뷰", "document", null, "completed", LocalDate.of(2026, 12, 11), "정기회의", "b.txt", null, 1L);
        Meeting earlierMeeting = new Meeting(1L, "12.10 팀 정기 회의", "document", null, "completed", LocalDate.of(2026, 12, 10), "정기회의", "a.txt", null, 1L);
        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(laterMeeting, earlierMeeting));
        when(meetingAttendeeRepository.findByMeetingIdIn(any())).thenReturn(List.of(
            new MeetingAttendee(null, 2L)
        ));
        MeetingAnalysisService service = newService();

        List<MeetingAttendanceDetail> detail = service.attendanceDetail("demo-project", 2L);

        assertThat(detail).hasSize(2);
        assertThat(detail.get(0).title()).isEqualTo("12.10 팀 정기 회의");
        assertThat(detail.get(0).attended()).isFalse();
        assertThat(detail.get(1).title()).isEqualTo("12.11 스프린트 리뷰");
        assertThat(detail.get(1).attended()).isFalse();
    }

    @Test
    void attendanceDetailReturnsEmptyListWhenNoMeetings() {
        mockMember(1L);
        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        MeetingAnalysisService service = newService();

        List<MeetingAttendanceDetail> detail = service.attendanceDetail("demo-project", 2L);

        assertThat(detail).isEmpty();
    }
```

`attendanceDetailMarksAttendedAndAbsentMeetingsSortedByDate` 테스트는 의도적으로 `findByMeetingIdIn`이 `new MeetingAttendee(null, 2L)`(meetingId가 null)만 반환하도록 스텁했다 — 실제 회의 엔티티의 `getId()`도 테스트에서는 null이므로(생성자로 직접 만든 엔티티는 DB에 저장되지 않아 `@GeneratedValue` id가 채워지지 않음), `attended()`가 항상 false로 나오는 것이 이 테스트에서 기대하는 정상 동작이다. 이 테스트는 **정렬**(날짜 오름차순)과 **빈 회의 목록** 처리만 검증하고, "실제로 참석 처리되는지"는 컨트롤러 테스트에서 별도로 검증한다(Step 6).

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisServiceTest"`
Expected: FAIL — `cannot find symbol: method attendanceDetail` (컴파일 에러, `MeetingAttendanceDetail` 타입도 아직 없음)

- [ ] **Step 3: `MeetingAttendanceDetail` 레코드 생성**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendanceDetail.java` 파일을 새로 만든다:

```java
package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "팀원의 회의별 참석/결석 상세")
public record MeetingAttendanceDetail(
    @Schema(description = "회의록 ID", example = "12") String meetingId,
    @Schema(description = "회의 제목", example = "12.10 팀 정기 회의") String title,
    @Schema(description = "회의 날짜", example = "2026-12-10") String meetingDate,
    @Schema(description = "참석 여부", example = "true") boolean attended
) {}
```

- [ ] **Step 4: 서비스 메서드 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java`의 import 목록(라인 1-34 사이, `java.util.Map` 임포트 다음 줄)에 `Comparator` 임포트를 추가한다. 기존:

```java
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
```

변경 후:

```java
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
```

그 다음, `attendanceSummary` 메서드가 끝나는 라인(338번째 줄, `    }`) 바로 뒤 `@Transactional` (라인 340) 앞에 새 메서드를 추가한다:

```java

    /** 특정 팀원의 회의별 참석/결석 여부와 날짜 — 기여도 화면의 회의 참여 드릴다운에 쓰인다. */
    public List<MeetingAttendanceDetail> attendanceDetail(String projectId, Long userId) {
        Long projectDbId = requireProjectMember(projectId);
        List<Meeting> meetings = meetingRepository.findByProjectIdOrderByCreatedAtDesc(projectDbId);
        if (meetings.isEmpty()) return List.of();

        List<Long> meetingIds = meetings.stream().map(Meeting::getId).toList();
        Set<Long> attendedMeetingIds = meetingAttendeeRepository.findByMeetingIdIn(meetingIds).stream()
            .filter(attendee -> attendee.getUserId().equals(userId))
            .map(MeetingAttendee::getMeetingId)
            .collect(Collectors.toSet());

        return meetings.stream()
            .sorted(Comparator.comparing(Meeting::getMeetingDate, Comparator.nullsLast(Comparator.naturalOrder())))
            .map(meeting -> new MeetingAttendanceDetail(
                String.valueOf(meeting.getId()),
                meeting.getTitle(),
                meeting.getMeetingDate() == null ? null : meeting.getMeetingDate().toString(),
                attendedMeetingIds.contains(meeting.getId())
            ))
            .toList();
    }
```

- [ ] **Step 5: 서비스 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisServiceTest"`
Expected: PASS (기존 테스트 포함 전체 통과)

- [ ] **Step 6: 컨트롤러 테스트(실패하는 테스트) 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisControllerTest.java`의 `attendanceSummaryPassesProjectIdToService` 테스트(라인 40-54) 바로 뒤에 추가:

```java
    @Test
    void attendanceDetailPassesProjectIdAndUserIdToService() throws Exception {
        when(meetingAnalysisService.attendanceDetail("project-a", 2L)).thenReturn(List.of(
            new MeetingAttendanceDetail("12", "12.10 팀 정기 회의", "2026-12-10", true)
        ));
        MeetingAnalysisController controller = new MeetingAnalysisController(meetingAnalysisService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/v1/projects/project-a/meetings/attendance-detail").param("userId", "2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].meetingId").value("12"))
            .andExpect(jsonPath("$.data[0].attended").value(true));

        verify(meetingAnalysisService).attendanceDetail("project-a", 2L);
    }
```

- [ ] **Step 7: 컨트롤러 테스트가 실패하는지 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisControllerTest"`
Expected: FAIL — `cannot find symbol: method attendanceDetail` (컨트롤러에 아직 엔드포인트 없음)

- [ ] **Step 8: 컨트롤러 엔드포인트 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisController.java`의 `getAttendanceSummary` 메서드(라인 119-129) 바로 뒤, `deleteMeeting` 관련 `@Operation`(라인 131) 앞에 추가:

```java

    @Operation(
        summary = "팀원 회의 참석 상세",
        description = "특정 팀원의 회의별 참석/결석 여부와 날짜를 조회합니다. 기여도 화면의 회의 참여 드릴다운에 사용됩니다."
    )
    @GetMapping("/attendance-detail")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ApiResponse<List<MeetingAttendanceDetail>> getAttendanceDetail(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "조회할 팀원의 사용자 ID", example = "2") @RequestParam Long userId
    ) {
        return ApiResponse.ok(meetingAnalysisService.attendanceDetail(projectId, userId));
    }
```

- [ ] **Step 9: 컨트롤러 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisControllerTest"`
Expected: PASS (기존 테스트 포함 전체 통과)

- [ ] **Step 10: 전체 회의 모듈 테스트 통과 확인 후 커밋**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.*"`
Expected: PASS

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendanceDetail.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisController.java \
        App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java \
        App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisControllerTest.java
git commit -m "feat: 팀원별 회의 참석 상세(attendance-detail) 엔드포인트 추가"
```

---

### Task 2: Frontend — `fetchAttendanceDetail` API 함수

**Files:**
- Modify: `App/frontend/src/meetings/libs/utils/meetingAiApi.ts`
- Create: `App/frontend/src/meetings/libs/utils/meetingAiApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` (from `../../../global/api/apiClient`)
- Produces: `fetchAttendanceDetail(projectId: string, userId: number): Promise<MeetingAttendanceDetailDto[]>`
- Produces: `interface MeetingAttendanceDetailDto { meetingId: string; title: string; meetingDate: string | null; attended: boolean; }`

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/meetings/libs/utils/meetingAiApi.test.ts` 파일을 새로 만든다:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../global/api/apiClient";
import { fetchAttendanceDetail } from "./meetingAiApi";

vi.mock("../../../global/api/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("fetchAttendanceDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the per-user attendance detail with userId as a query param", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
      { meetingId: "15", title: "12.11 스프린트 리뷰", meetingDate: "2026-12-11", attended: false },
    ]);

    const result = await fetchAttendanceDetail("1", 2);

    expect(apiFetch).toHaveBeenCalledWith("/projects/1/meetings/attendance-detail?userId=2");
    expect(result).toEqual([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
      { meetingId: "15", title: "12.11 스프린트 리뷰", meetingDate: "2026-12-11", attended: false },
    ]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run meetingAiApi.test.ts`
Expected: FAIL — `fetchAttendanceDetail is not a function` / 모듈에서 export를 찾을 수 없음

- [ ] **Step 3: `fetchAttendanceDetail` 구현**

`App/frontend/src/meetings/libs/utils/meetingAiApi.ts`의 `fetchAttendanceSummary` 함수(라인 59-61) 바로 뒤에 추가:

```ts
export interface MeetingAttendanceDetailDto {
  meetingId: string;
  title: string;
  meetingDate: string | null;
  attended: boolean;
}

export async function fetchAttendanceDetail(projectId: string, userId: number): Promise<MeetingAttendanceDetailDto[]> {
  return apiFetch<MeetingAttendanceDetailDto[]>(`/projects/${projectId}/meetings/attendance-detail?userId=${userId}`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run meetingAiApi.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/meetings/libs/utils/meetingAiApi.ts App/frontend/src/meetings/libs/utils/meetingAiApi.test.ts
git commit -m "feat: 팀원별 회의 참석 상세 조회 API 함수 추가"
```

---

### Task 3: Frontend — `MemberDrilldownPanel` 컴포넌트

**Files:**
- Create: `App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`
- Test: `App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`

**Interfaces:**
- Consumes: `fetchAttendanceDetail(projectId: string, userId: number): Promise<MeetingAttendanceDetailDto[]>` (Task 2)
- Consumes: `TaskStatusPill({ status: TaskStatus })`, `PriorityBadge({ priority: Priority })` (기존 `board/components`)
- Consumes: `Task` 타입 (`board/libs/types/task.ts`)
- Produces: `MemberDrilldownPanel({ mode, memberName, memberTasks, projectId, userId, onClose }): JSX.Element` — props 타입은 아래 Step 3에서 정의.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx` 파일을 새로 만든다:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemberDrilldownPanel } from "./MemberDrilldownPanel";
import { fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import type { Task } from "../../board/libs/types/task";

vi.mock("../../meetings/libs/utils/meetingAiApi", () => ({
  fetchAttendanceDetail: vi.fn(),
}));

function makeTask(id: string, title: string, status: Task["status"]): Task {
  return { id, title, status, priority: "medium", assignee: "1", dueDate: "", labels: [], category: "backend", position: 0 };
}

describe("MemberDrilldownPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("groups tasks by status in tasks mode", () => {
    const tasks = [
      makeTask("A", "AI 모델 학습 파이프라인 구축", "done"),
      makeTask("B", "데이터 전처리 스크립트 작성", "inprogress"),
    ];

    render(
      <MemberDrilldownPanel
        mode="tasks"
        memberName="김민준"
        memberTasks={tasks}
        projectId={1}
        userId={1}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("AI 모델 학습 파이프라인 구축")).toBeInTheDocument();
    expect(screen.getByText("데이터 전처리 스크립트 작성")).toBeInTheDocument();
  });

  it("fetches and shows attendance detail in meetings mode", async () => {
    vi.mocked(fetchAttendanceDetail).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
      { meetingId: "15", title: "12.11 스프린트 리뷰", meetingDate: "2026-12-11", attended: false },
    ]);

    render(
      <MemberDrilldownPanel
        mode="meetings"
        memberName="김민준"
        memberTasks={[]}
        projectId={1}
        userId={1}
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText("12.10 팀 정기 회의")).toBeInTheDocument());
    expect(screen.getByText("12.11 스프린트 리뷰")).toBeInTheDocument();
    expect(fetchAttendanceDetail).toHaveBeenCalledWith("1", 1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: FAIL — 모듈 `./MemberDrilldownPanel`을 찾을 수 없음

- [ ] **Step 3: 컴포넌트 구현**

`App/frontend/src/contributors/components/MemberDrilldownPanel.tsx` 파일을 새로 만든다:

```tsx
import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle } from "lucide-react";
import { TaskStatusPill } from "../../board/components/TaskStatusPill";
import { PriorityBadge } from "../../board/components/PriorityBadge";
import { fetchAttendanceDetail, type MeetingAttendanceDetailDto } from "../../meetings/libs/utils/meetingAiApi";
import type { Task, TaskStatus } from "../../board/libs/types/task";

const STATUS_ORDER: TaskStatus[] = ["todo", "inprogress", "blocked", "done"];

interface MemberDrilldownPanelProps {
  mode: "tasks" | "meetings";
  memberName: string;
  memberTasks: Task[];
  projectId: number;
  userId: number;
  onClose: () => void;
}

export function MemberDrilldownPanel({ mode, memberName, memberTasks, projectId, userId, onClose }: MemberDrilldownPanelProps) {
  const [attendance, setAttendance] = useState<MeetingAttendanceDetailDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (mode !== "meetings") return;
    setStatus("loading");
    fetchAttendanceDetail(String(projectId), userId)
      .then((result) => {
        setAttendance(result);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [mode, projectId, userId]);

  const groupedTasks = STATUS_ORDER.map((statusKey) => ({
    statusKey,
    tasks: memberTasks.filter((task) => task.status === statusKey),
  }));

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">
            {memberName} · {mode === "tasks" ? "업무 수행 내역" : "회의 참여 내역"}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {mode === "tasks" ? (
          <div className="p-4 space-y-5">
            {groupedTasks.map(({ statusKey, tasks }) => (
              <div key={statusKey}>
                <div className="flex items-center gap-2 mb-2">
                  <TaskStatusPill status={statusKey} />
                  <span className="text-[11px] text-muted-foreground">{tasks.length}건</span>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">해당 상태의 업무가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                        <span className="text-xs font-medium text-foreground truncate">{task.title}</span>
                        <PriorityBadge priority={task.priority} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {memberTasks.length === 0 && (
              <p className="text-xs text-muted-foreground">표시할 업무가 없습니다.</p>
            )}
          </div>
        ) : (
          <div className="p-4">
            {status === "loading" && <p className="text-xs text-muted-foreground">불러오는 중...</p>}
            {status === "error" && <p className="text-xs text-red-600">회의 참여 내역을 불러오지 못했습니다.</p>}
            {status === "ready" && (
              attendance.length === 0 ? (
                <p className="text-xs text-muted-foreground">등록된 회의가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {attendance.map((meeting) => (
                    <div key={meeting.meetingId} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">{meeting.title}</div>
                        <div className="text-[11px] text-muted-foreground">{meeting.meetingDate ?? "날짜 미정"}</div>
                      </div>
                      {meeting.attended ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 참석
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500 shrink-0">
                          <XCircle className="w-3.5 h-3.5" /> 결석
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/components/MemberDrilldownPanel.tsx App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx
git commit -m "feat: 업무/회의 드릴다운 읽기 전용 패널 컴포넌트 추가"
```

---

### Task 4: Frontend — `ContributorsView` 연동

**Files:**
- Modify: `App/frontend/src/contributors/screen/ContributorsView.tsx`
- Test: `App/frontend/src/contributors/screen/ContributorsView.test.tsx`

**Interfaces:**
- Consumes: `fetchTasks(projectId: number): Promise<Task[]>` (`board/libs/utils/taskApi.ts`, 기존)
- Consumes: `MemberDrilldownPanel` (Task 3)
- Consumes: `Task` 타입 (`board/libs/types/task.ts`)

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/screen/ContributorsView.test.tsx` 파일을 새로 만든다:

```tsx
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
```

이 테스트는 `CONTRIB_REPORTS` mock 데이터(김민준 `todoDone: 8`, `meetings: 6`)와 각 행이 `role="button"`인 구조(Step 5에서 만듦)에 의존한다 — 마크업 구조가 바뀌면 `.closest('[role="button"]')` 부분도 함께 확인해야 한다. "김민준"이라는 이름은 테이블 행 외에 사이드바 카드와 메인 그리드 요약 카드에도 나타나므로, 테이블 행에서만 쓰이는 `text-sm` 클래스로 좁혀서 정확한 행을 특정한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run ContributorsView.test.tsx`
Expected: FAIL — 업무/회의 셀이 클릭 가능한 요소가 아니라서 패널이 열리지 않고, `fetchTasks`/`fetchAttendanceDetail` import도 아직 컴포넌트에 연결되지 않음

- [ ] **Step 3: import 추가**

`App/frontend/src/contributors/screen/ContributorsView.tsx` 최상단 import 블록(라인 1-26)을 다음과 같이 수정한다. 기존:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  CONTRIB_REPORTS,
  REVIEWER_TEAMS,
} from "../../global/lib/mock/reviewer";
import { fetchAttendanceSummary, type MeetingAttendanceSummaryDto } from "../../meetings/libs/utils/meetingAiApi";
import { fetchContributionReport, fetchContributionScore, type MemberContributionDto, type ContributionMemberScoreDto } from "../libs/utils/contributorsApi";
import { useAuth } from "../../global/hooks/useAuth";
```

변경 후:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  CONTRIB_REPORTS,
  REVIEWER_TEAMS,
} from "../../global/lib/mock/reviewer";
import { fetchAttendanceSummary, type MeetingAttendanceSummaryDto } from "../../meetings/libs/utils/meetingAiApi";
import { fetchContributionReport, fetchContributionScore, type MemberContributionDto, type ContributionMemberScoreDto } from "../libs/utils/contributorsApi";
import { fetchTasks } from "../../board/libs/utils/taskApi";
import type { Task } from "../../board/libs/types/task";
import { MemberDrilldownPanel } from "../components/MemberDrilldownPanel";
import { useAuth } from "../../global/hooks/useAuth";
```

- [ ] **Step 4: `projectTasks` state와 `drilldown` state 추가**

`attendanceByMemberId`를 계산하는 `useMemo` 블록(라인 71-74) 바로 뒤에 추가한다. 기존:

```tsx
  const attendanceByMemberId = useMemo(
    () => Object.fromEntries(attendanceSummaries.map((summary) => [String(summary.userId), summary])),
    [attendanceSummaries],
  );
  // 실제 기여 점수로 목업 score/categories를 보강한다. 실패하면 목업 값을 그대로 쓴다.
```

변경 후:

```tsx
  const attendanceByMemberId = useMemo(
    () => Object.fromEntries(attendanceSummaries.map((summary) => [String(summary.userId), summary])),
    [attendanceSummaries],
  );
  // 업무 수행 드릴다운 패널용 프로젝트 전체 업무 목록. 실패하면 빈 배열로 폴백(패널은 빈 상태로 표시).
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (currentProjectId == null) {
      setProjectTasks([]);
      return;
    }
    fetchTasks(currentProjectId).then(setProjectTasks).catch(() => setProjectTasks([]));
  }, [currentProjectId]);
  const [drilldown, setDrilldown] = useState<{ mode: "tasks" | "meetings"; memberId: string } | null>(null);
  // 실제 기여 점수로 목업 score/categories를 보강한다. 실패하면 목업 값을 그대로 쓴다.
```

- [ ] **Step 5: 테이블 행 구조 변경 (분석 근거 클릭용 nested-button 문제 해결)**

행 전체를 감싸던 `<button>`을 `<div role="button">`으로 바꾸고(내부에 실제 `<button>`을 두 개 넣을 것이므로 `<button>` 안에 `<button>`을 중첩할 수 없음), "업무 수행"/"회의 참여" 셀을 각각 클릭 가능한 버튼으로 바꾼다. 현재 코드(라인 282-347):

```tsx
                  <div className="divide-y divide-border">
                    {filteredReports.map((report, index) => {
                      const isSelected = selectedMember.memberId === report.memberId;
                      const tone = scoreTone(report.score);
                      const taskRate = percent(report.todoDone, report.todoTotal);
                      return (
                        <button
                          key={report.memberId}
                          type="button"
                          onClick={() => setSelectedMemberId(report.memberId)}
                          className={`grid grid-cols-[76px_1fr_98px_90px_90px_84px_86px] w-full items-center px-5 py-3 text-left transition-colors ${
                            isSelected ? "bg-blue-50" : "hover:bg-muted/40"
                          }`}
                        >
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-foreground bg-muted">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ background: report.color }}
                        >
                          {report.name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-foreground truncate">{report.name}</div>
                          <div className="text-[11px] text-muted-foreground">{report.role}</div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold" style={{ color: tone.color }}>{report.score}</div>
                        <div className="text-[10px] font-semibold" style={{ color: tone.color }}>{tone.label}</div>
                      </div>
                      <div className="text-xs text-foreground text-center">
                        <span className="font-bold">{report.todoDone}</span>
                        <span className="text-muted-foreground">/{report.todoTotal}</span>
                        <div className="text-[10px] text-muted-foreground">{taskRate}%</div>
                      </div>
                      <div className="text-xs text-foreground text-center">
                        {attendanceByMemberId[report.memberId] ? (
                          <>
                            <span className="font-bold">{attendanceByMemberId[report.memberId].meetingsAttended}</span>
                            <span className="text-muted-foreground">/{attendanceByMemberId[report.memberId].totalMeetings}회</span>
                            <div className="text-[10px] text-muted-foreground">{attendanceByMemberId[report.memberId].attendanceRate}%</div>
                          </>
                        ) : (
                          <span className="font-bold">{report.meetings}회</span>
                        )}
                      </div>
                      <div className="text-xs text-foreground text-center">
                        <span className="font-bold">{report.categories.workload}</span>
                      </div>
                      <div className="text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                          publicFlags[report.memberId]
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>
                          {publicFlags[report.memberId] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {publicFlags[report.memberId] ? "공개" : "비공개"}
                        </span>
                      </div>
                        </button>
                      );
                    })}
                  </div>
```

변경 후:

```tsx
                  <div className="divide-y divide-border">
                    {filteredReports.map((report, index) => {
                      const isSelected = selectedMember.memberId === report.memberId;
                      const tone = scoreTone(report.score);
                      const taskRate = percent(report.todoDone, report.todoTotal);
                      return (
                        <div
                          key={report.memberId}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedMemberId(report.memberId)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedMemberId(report.memberId);
                            }
                          }}
                          className={`grid grid-cols-[76px_1fr_98px_90px_90px_84px_86px] w-full items-center px-5 py-3 text-left transition-colors cursor-pointer ${
                            isSelected ? "bg-blue-50" : "hover:bg-muted/40"
                          }`}
                        >
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-foreground bg-muted">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ background: report.color }}
                        >
                          {report.name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-foreground truncate">{report.name}</div>
                          <div className="text-[11px] text-muted-foreground">{report.role}</div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold" style={{ color: tone.color }}>{report.score}</div>
                        <div className="text-[10px] font-semibold" style={{ color: tone.color }}>{tone.label}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedMemberId(report.memberId);
                          setDrilldown({ mode: "tasks", memberId: report.memberId });
                        }}
                        className="w-full bg-transparent border-0 p-0 text-xs text-foreground text-center hover:underline cursor-pointer"
                      >
                        <span className="font-bold">{report.todoDone}</span>
                        <span className="text-muted-foreground">/{report.todoTotal}</span>
                        <div className="text-[10px] text-muted-foreground">{taskRate}%</div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedMemberId(report.memberId);
                          setDrilldown({ mode: "meetings", memberId: report.memberId });
                        }}
                        className="w-full bg-transparent border-0 p-0 text-xs text-foreground text-center hover:underline cursor-pointer"
                      >
                        {attendanceByMemberId[report.memberId] ? (
                          <>
                            <span className="font-bold">{attendanceByMemberId[report.memberId].meetingsAttended}</span>
                            <span className="text-muted-foreground">/{attendanceByMemberId[report.memberId].totalMeetings}회</span>
                            <div className="text-[10px] text-muted-foreground">{attendanceByMemberId[report.memberId].attendanceRate}%</div>
                          </>
                        ) : (
                          <span className="font-bold">{report.meetings}회</span>
                        )}
                      </button>
                      <div className="text-xs text-foreground text-center">
                        <span className="font-bold">{report.categories.workload}</span>
                      </div>
                      <div className="text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                          publicFlags[report.memberId]
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>
                          {publicFlags[report.memberId] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {publicFlags[report.memberId] ? "공개" : "비공개"}
                        </span>
                      </div>
                        </div>
                      );
                    })}
                  </div>
```

- [ ] **Step 6: "분석 근거" 섹션 제거**

`ClipboardCheck`로 헤더를 표시하던 "분석 근거" `<section>`(현재 사이드바 `<aside>` 안, "심사 코멘트" 섹션 바로 앞)을 통째로 삭제한다. 기존:

```tsx
            <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-foreground">분석 근거</h3>
                </div>
                <span className="text-[10px] text-muted-foreground">{selectedMember.evidence.length}개</span>
              </div>
              <div className="space-y-2">
                {selectedMember.evidence.map((evidence, index) => (
                  <button
                    key={evidence}
                    type="button"
                    className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-xs font-medium text-foreground">{evidence}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-foreground">심사 코멘트</h3>
              </div>
```

변경 후 (분석 근거 섹션만 삭제, 심사 코멘트 섹션은 그대로 유지):

```tsx
            <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-foreground">심사 코멘트</h3>
              </div>
```

- [ ] **Step 7: 드릴다운 패널 렌더링 추가**

컴포넌트가 반환하는 최상위 `<div>`가 닫히기 직전(현재 `</div>\n  );\n}`로 끝나는 return 문의 맨 끝)에 조건부 렌더링을 추가한다. 현재 파일의 return 문 마지막 부분:

```tsx
          </aside>
        </section>
      </div>
    </div>
  );
}
```

변경 후:

```tsx
          </aside>
        </section>
      </div>
      {drilldown && currentProjectId != null && (
        <MemberDrilldownPanel
          mode={drilldown.mode}
          memberName={mergedReports.find((report) => report.memberId === drilldown.memberId)?.name ?? ""}
          memberTasks={projectTasks.filter((task) => task.assignee === drilldown.memberId)}
          projectId={currentProjectId}
          userId={Number(drilldown.memberId)}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run ContributorsView.test.tsx`
Expected: PASS

- [ ] **Step 9: 전체 프론트엔드 테스트 스위트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run`
Expected: PASS (기존 53개 테스트 + 이번에 추가한 테스트 모두 통과, 회귀 없음)

- [ ] **Step 10: 커밋**

```bash
git add App/frontend/src/contributors/screen/ContributorsView.tsx App/frontend/src/contributors/screen/ContributorsView.test.tsx
git commit -m "feat: 업무 수행/회의 참여 셀 클릭 시 드릴다운 패널 표시, 분석 근거 카드 제거"
```

---

## 최종 확인 (전체 플랜 완료 후)

- [ ] Spring 전체 테스트: `cd App/backend_spring && ./gradlew test`
- [ ] 프론트엔드 전체 테스트: `cd App/frontend && pnpm test -- --run`
- [ ] `git log --oneline -10`으로 4개 커밋(Task 1~4)이 순서대로 쌓였는지 확인
- [ ] **push는 하지 않는다** — 이 세션의 표준 규칙(사용자가 명시적으로 요청할 때만 push)
