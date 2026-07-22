# FS-09 기여도 테이블 "업무 수행"/"회의 참여" 드릴다운 패널 설계

## Context

심사자 화면(`ContributorsView.tsx`) 사이드바의 "분석 근거"(To-Do #, PR #, 회의록 번호를 나열하던 카드)는 제거한다. 대신 그 정보를 테이블의 "업무 수행"(`8/10`)과 "회의 참여"(`4/4회`) 컬럼에 직접 연결한다: 각 셀을 클릭하면 업무 보드 대시보드처럼 화면 오른쪽에 패널이 나타나며, 해당 팀원이 **어떤 업무를 완료/미완료했는지**, **어떤 회의에 몇 월 며칠에 참석/결석했는지** 구체적으로 보여준다.

## Goals

- 사이드바 "분석 근거" 카드 제거.
- 테이블의 "업무 수행" 셀 클릭 → 우측 드릴다운 패널: 해당 팀원의 **전체 업무를 상태별(할 일/진행 중/보류-블로커/완료)로 구분**해서 표시.
- 테이블의 "회의 참여" 셀 클릭 → 우측 드릴다운 패널: 해당 팀원의 **회의별 참석/결석 여부와 날짜** 표시.
- 두 패널 모두 **읽기 전용** (심사자가 팀원 업무를 수정/편집할 수 없어야 함).

## Non-goals

- 업무 보드의 `TaskDetailPanel`(체크리스트/코멘트/활동로그 편집 포함) 재사용 — 하지 않는다. 심사자용으로는 목록만 보여주는 훨씬 가벼운 컴포넌트를 새로 만든다.
- 회의록 AI 분석 내용(결정사항/위험요소 등) 표시 — 이번 스코프는 참석/결석 여부와 날짜까지만.

## Architecture

```
[업무 수행 드릴다운] — 신규 백엔드 없음
  board/libs/utils/taskApi.ts의 fetchTasks(projectId) 재사용
  → ContributorsView에서 프로젝트 업무 전체를 한 번 fetch (신규 useEffect)
  → 클릭 시 assignee === memberId로 클라이언트 필터링 + status별 그룹화

[회의 참여 드릴다운] — 신규 Spring 엔드포인트 필요
  GET /projects/{projectId}/meetings/attendance-detail?userId={userId}
  MeetingAnalysisController (신규 메서드) → MeetingAnalysisService.attendanceDetail(projectId, userId)
  - 기존 attendanceSummary()와 동일한 재료(meetingRepository.findByProjectIdOrderByCreatedAtDesc,
    meetingAttendeeRepository.findByMeetingIdIn)를 재사용, 집계 대신 회의별 목록으로 반환
        │
        ▼
  Frontend: fetchAttendanceDetail(projectId, userId) (meetingAiApi.ts 신규 함수)
        │
        ▼
[공통] ContributorsView: 클릭한 셀에 따라 우측 드릴다운 패널 오픈
  신규 컴포넌트: contributors/components/MemberDrilldownPanel.tsx
  - mode: "tasks" | "meetings"
  - 업무 보드 TaskDetailPanel과 동일한 시각적 패턴(우측에서 슬라이드인, 배경 오버레이, X 닫기 버튼)
    이지만 읽기 전용 목록만 렌더링
```

## API 계약

### Spring: `GET /projects/{projectId}/meetings/attendance-detail?userId={userId}`

```json
{
  "success": true,
  "data": [
    { "meetingId": "12", "title": "12.10 팀 정기 회의", "meetingDate": "2026-12-10", "attended": true },
    { "meetingId": "15", "title": "12.11 스프린트 리뷰", "meetingDate": "2026-12-11", "attended": false }
  ]
}
```

- 정렬: `meetingDate` 오름차순.
- 권한: 기존 `attendance-summary`와 동일하게 `@projectAccess.isMember(#projectId)` (심사자 전용으로 더 좁힐 필요는 없음 — 이미 프로젝트 멤버 전체가 볼 수 있는 요약 정보의 상세 버전).
- 신규 DTO: `MeetingAttendanceDetail(String meetingId, String title, LocalDate meetingDate, boolean attended)`.

### Frontend

- `meetingAiApi.ts`: `fetchAttendanceDetail(projectId: string, userId: number): Promise<MeetingAttendanceDetailDto[]>` 추가.
- `ContributorsView.tsx`:
  - 신규 상태: `projectTasks: Task[]` — 마운트/`currentProjectId` 변경 시 `fetchTasks(currentProjectId)` 1회 호출 (board 모듈 재사용, 실패 시 조용히 빈 배열 폴백 — 기존 다른 fetch들과 동일 패턴).
  - 신규 상태: `drilldown: { mode: "tasks" | "meetings"; memberId: string } | null`.
  - 테이블의 "업무 수행" 셀, "회의 참여" 셀을 각각 클릭 가능한 버튼으로 변경 (현재는 plain `<div>`), 클릭 시 `setDrilldown({ mode, memberId: report.memberId })`.
  - `drilldown`이 설정되면 `MemberDrilldownPanel` 렌더링:
    - `mode === "tasks"`: `projectTasks.filter(t => t.assignee === drilldown.memberId)`를 `status`별로 그룹화해서 표시 (할 일/진행 중/보류-블로커/완료 순서, 업무 보드 컬럼과 동일 순서). 업무 제목 + 우선순위 배지 표시.
    - `mode === "meetings"`: `fetchAttendanceDetail(String(currentProjectId), Number(drilldown.memberId))`를 열릴 때 호출, 로딩 중 스피너, 완료 시 날짜순 목록에 참석(체크)/결석(X) 아이콘과 회의 제목 표시.

## 에러 처리

- `fetchAttendanceDetail` 실패: 패널 내부에 "회의 참여 내역을 불러오지 못했습니다" 텍스트 표시 (패널 자체는 열린 채로, 전체 화면 에러로 만들지 않음).
- `projectTasks` fetch 실패: 조용히 빈 배열 유지 → "업무 수행" 패널을 열면 "표시할 업무가 없습니다" 처럼 빈 상태로 보임 (기존 세션의 다른 catch-to-empty 패턴과 동일).

## 테스트 계획

- Spring: `MeetingAnalysisServiceTest`에 `attendanceDetail()` 케이스 추가 (참석/결석 혼합, 회의 0건, 팀원이 project_member가 아닌 경우). `MeetingAnalysisControllerTest`에 신규 엔드포인트 권한/응답 매핑 테스트 추가.
- Frontend: `meetingAiApi`에 대한 기존 테스트 파일에 `fetchAttendanceDetail` 케이스 추가. `MemberDrilldownPanel`은 별도 컴포넌트 테스트(모드별 렌더링) 또는 `ContributorsView` 통합 테스트로 클릭→패널 오픈 확인.

## 알려진 한계

- "회의 참여" 드릴다운은 참석 여부만 보여주고 회의 내용(AI 분석 결과)까지는 보여주지 않는다 — 필요하면 추후 회의 상세 화면으로 이동하는 링크를 추가할 수 있음(이번 스코프 아님).
- `projectTasks`를 프론트에서 한 번에 fetch하는 방식이라, 업무가 매우 많은 프로젝트에서는 다소 무거울 수 있음 — 캡스톤 팀 규모(수십~백여 건) 기준으로는 문제없음.
