# 기여도 분석 읽기 전용 근거 패널 설계

## 배경

심사자 전용 기여도 분석 화면에는 이미 팀원별 `업무 수행`/`회의 참여` 셀을 클릭하면 우측 드릴다운 패널을 여는 구조가 있다. 현재 패널은 업무 제목/우선순위와 회의 참석 여부만 보여주므로, 심사자가 기여도 점수의 근거를 검토하기에는 정보가 부족하다.

이번 변경의 목적은 심사자가 같은 패널에서 업무 To-do/체크리스트/작업 내용과 회의록 AI 분석 결과를 확인할 수 있게 하는 것이다. 단, 심사자는 근거를 검토만 해야 하므로 모든 기능은 읽기 전용으로 제한한다. 체크리스트 수정, 작업 내용 저장, 링크/파일 추가·삭제, 회의록 To-do 업무 등록은 제공하지 않는다.

추가로, 테이블의 "업무 편중도" 컬럼(`workload_component`, `ml_workload_score`가 계산하는 과부하/저활동 이상치 점수)도 지금은 숫자만 보여주고 클릭이 되지 않는다. 심사자가 "이 숫자가 왜 이 값인지"를 판단하려면 팀 평균 대비 업무량·난이도·지연 현황 같은 근거가 필요하므로, 같은 우측 드릴다운 패널에 "편중도 근거" 모드를 추가한다.

## 범위

### 포함

- `ContributorsView`의 기존 `MemberDrilldownPanel` 확장
- 업무 카드 클릭 시 읽기 전용 상세 근거 펼침
  - 체크리스트 항목과 완료 여부
  - 작업 내용(`TaskResult.content`)
  - 첨부 링크 목록
  - 첨부 파일 이름/개수
- 회의 카드 클릭 시 읽기 전용 AI 분석 근거 펼침
  - AI 요약
  - 결정사항
  - To-do 후보
  - 리스크
  - 처리중/실패/분석 없음 상태 메시지
- **"업무 편중도" 점수 클릭 시 읽기 전용 과부하/저활동 근거 펼침**
  - 과부하 의심 / 저활동 의심 / 정상 분류와 그 이유
  - 팀 평균 대비 진행 중 업무량, 업무 난이도, 지연(overdue) 업무 비교
  - 위 수치를 코드로 조합한 한국어 근거 문장(LLM 미개입, 결정론적 템플릿)
- 기존 API 재사용
  - `fetchChecklist()` — `App/frontend/src/board/libs/utils/checklistApi.ts`
  - `fetchTaskResult()` — `App/frontend/src/board/libs/utils/taskResultApi.ts`
  - `fetchMeeting()` — `App/frontend/src/meetings/libs/utils/meetingAiApi.ts`
  - `fetchContributionScore()` — `App/frontend/src/contributors/libs/utils/contributorsApi.ts` (편중도 근거용, 필드만 확장해서 재사용 — 신규 API 호출 없음)

### 제외

- 심사자 화면에서 체크리스트 수정
- 심사자 화면에서 작업 내용 저장/링크·파일 관리
- 심사자 화면에서 회의록 AI To-do를 업무로 등록
- 신규 백엔드 API 엔드포인트 추가 (편중도 근거는 기존 `/ai/score/contribution` 응답 필드 확장으로 처리 — 새 엔드포인트 없음)
- 팀 간 편중도 비교(다른 프로젝트/팀과의 비교) — 이번 스코프는 같은 프로젝트 팀 내 상대 비교로 한정

## UI/UX 설계

기존 우측 슬라이드 패널은 유지한다.

업무 모드:

1. 상태별 업무 그룹(`todo`, `inprogress`, `blocked`, `done`)을 그대로 표시한다.
2. 각 업무 카드는 버튼처럼 동작하지만, 편집 UI가 아니라 상세 근거를 펼치는 트리거다.
3. 선택된 업무 아래에 읽기 전용 상세 영역을 표시한다.
4. 상세 로딩 중에는 작은 로딩 문구를 보여준다.
5. 체크리스트나 작업 내용 API 중 일부가 실패해도 패널 전체를 닫지 않고, 실패한 영역에만 에러 문구를 표시한다.

회의 모드:

1. 기존 회의 참석/결석 목록을 그대로 표시한다.
2. 회의 카드를 클릭하면 해당 회의의 AI 분석 결과를 가져와 같은 패널 안에 펼친다.
3. `analysisStatus`가 완료가 아니거나 `analysis`가 없으면 상태에 맞는 안내 문구를 표시한다.
4. 완료된 회의는 요약, 결정사항, To-do 후보, 리스크를 섹션별로 표시한다.

편중도 모드(신규):

1. 테이블의 "업무 편중도" 셀을 다른 두 컬럼(업무 수행/회의 참여)과 동일하게 클릭 가능한 버튼으로 바꾼다(현재는 클릭 불가능한 `<div>`).
2. 클릭 시 `MemberDrilldownPanel`이 `mode: "workload"`로 열린다.
3. 이 모드는 **비동기 fetch가 없다** — `ContributorsView`가 페이지 진입 시 이미 호출해 둔 `fetchContributionScore()` 결과(`contributionByMemberId`)를 그대로 prop으로 내려받아 즉시 렌더링한다. 업무/회의 모드처럼 패널이 열릴 때 로딩 스피너가 뜨는 구간이 없다.
4. 상단에 분류 배지를 표시한다: `과부하 의심`(적색 계열) / `저활동 의심`(주황 계열) / `정상`(회색/중립).
5. 배지 아래에 근거 bullet 목록을 표시한다 — 팀 평균 대비 진행 중 업무량 배율, 난이도 평균 배율, 지연 업무 건수, 완료율을 코드가 조합한 문장으로 렌더링한다(정확한 문구 규칙은 아래 "근거 문장 생성 규칙" 참고).
6. 근거 데이터가 없는 경우(해당 멤버가 `contributionByMemberId`에 없음 — API 실패 폴백 등) "편중도 근거를 불러오지 못했습니다" 문구를 표시한다. 패널 자체는 열린 채로 유지한다(업무/회의 모드의 부분 실패 처리와 동일한 원칙).

## 컴포넌트 설계

기존 `MemberDrilldownPanel`에 아래 보조 컴포넌트를 추가한다. 파일이 지나치게 커지면 후속 정리에서 별도 파일로 분리할 수 있지만, 이번 변경은 패널 전용 UI이므로 우선 같은 파일 안에 둔다.

- `TaskEvidenceDetails`
  - 입력: `projectId`, `taskId`
  - 역할: `fetchChecklist()`와 `fetchTaskResult()`를 병렬 호출하고, 읽기 전용 근거를 렌더링한다.
  - 오류 처리: `Promise.allSettled()` 또는 개별 catch로 부분 실패를 허용한다.

- `MeetingEvidenceDetails`
  - 입력: `projectId`, `meetingId`
  - 역할: `fetchMeeting()`을 호출하고 AI 분석 결과를 읽기 전용으로 렌더링한다.
  - 오류 처리: 조회 실패 시 회의 상세를 불러오지 못했다는 문구를 표시한다.

- `WorkloadEvidenceDetails`(신규)
  - 입력: `memberName`, `workloadEvidence: ContributionMemberScoreDto | undefined` (fetch 없이 부모가 이미 들고 있는 데이터를 그대로 전달)
  - 역할: `anomalyType`에 따라 배지 색상을 정하고, `buildWorkloadEvidenceSentences()`(신규 순수 함수, 아래 참고)로 생성한 근거 문장 목록을 렌더링한다.
  - 오류 처리: `workloadEvidence`가 `undefined`이면 "편중도 근거를 불러오지 못했습니다" 표시(네트워크 재호출 없음 — 이미 실패한 데이터이므로 재시도 없이 안내만 한다).

`MemberDrilldownPanel`은 선택 상태만 관리한다.

- `selectedTaskId: string | null`
- `selectedMeetingId: string | null`

`mode: "tasks" | "meetings" | "workload"`로 확장한다. 모드가 바뀌거나 패널 대상 멤버가 바뀌면 선택 상태를 초기화한다.

### `buildWorkloadEvidenceSentences()` (신규 순수 함수)

`App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`(또는 별도 유틸 파일)에 추가하는 결정론적 문장 생성 함수. LLM 호출 없이 숫자 비교만으로 문장을 조합한다 — 근거가 이미 계산된 수치이므로 자연어 생성에 불확실성을 끌어들일 이유가 없다.

```ts
interface WorkloadEvidenceInput {
  anomalyType: "과부하 의심" | "저활동 의심" | "정상" | string;
  taskCountActiveRel: number;   // 팀 평균 대비 진행 중 업무 비율 (1.0 = 평균과 동일)
  difficultyAvgRel: number;     // 팀 평균 대비 난이도 비율
  overdueCount: number;
  completionRate: number;       // 0~1
}

function buildWorkloadEvidenceSentences(input: WorkloadEvidenceInput): string[] {
  const sentences: string[] = [];
  const activeMultiple = input.taskCountActiveRel.toFixed(1);
  const difficultyMultiple = input.difficultyAvgRel.toFixed(1);

  if (input.anomalyType === "과부하 의심") {
    if (input.taskCountActiveRel > 1.0) {
      sentences.push(`진행 중인 업무가 팀 평균 대비 ${activeMultiple}배 많습니다.`);
    }
    if (input.difficultyAvgRel > 1.0) {
      sentences.push(`담당 업무의 평균 난이도가 팀 평균보다 ${difficultyMultiple}배 높습니다.`);
    }
    if (input.overdueCount > 0) {
      sentences.push(`마감이 지난 업무가 ${input.overdueCount}건 있습니다.`);
    }
    sentences.push(`업무 완료율은 ${Math.round(input.completionRate * 100)}%로 팀 평균보다 낮습니다.`);
  } else if (input.anomalyType === "저활동 의심") {
    sentences.push(`진행 중인 업무가 팀 평균 대비 ${activeMultiple}배 적습니다.`);
    sentences.push(`업무 완료율은 ${Math.round(input.completionRate * 100)}%로 팀 평균보다 높습니다.`);
  } else {
    sentences.push("팀 평균과 비교했을 때 업무량·난이도·완료율 모두 특별한 편중이 없습니다.");
  }
  return sentences;
}
```

- 어떤 조건절도 매칭되지 않아 `sentences`가 비어 있으면(이론상 `과부하 의심`인데 세 조건 다 거짓인 경우 등) 최소 하나는 항상 나가도록 마지막 완료율 문장을 조건 없이 push한다(이미 위 구현대로 처리됨).
- 이 함수는 순수 함수이므로 `MemberDrilldownPanel.test.tsx`에서 컴포넌트 렌더링 없이 단위 테스트하기 쉽다.

## 데이터 흐름

업무 상세:

```text
업무 카드 클릭
→ selectedTaskId 설정
→ TaskEvidenceDetails mount
→ fetchChecklist(taskId, projectId) + fetchTaskResult(taskId, projectId)
→ 체크리스트/작업 내용/링크/파일 읽기 전용 표시
```

회의 상세:

```text
회의 카드 클릭
→ selectedMeetingId 설정
→ MeetingEvidenceDetails mount
→ fetchMeeting(projectId, meetingId)
→ analysis 상태에 따라 AI 근거 읽기 전용 표시
```

편중도 근거(신규):

```text
"업무 편중도" 셀 클릭
→ drilldown = { mode: "workload", memberId }
→ MemberDrilldownPanel: contributionByMemberId[memberId]를 prop으로 그대로 사용 (신규 fetch 없음)
→ WorkloadEvidenceDetails: anomalyType 배지 + buildWorkloadEvidenceSentences() 결과 표시
```

## 백엔드 스키마 확장 (편중도 근거 전용)

편중도 근거 문장을 만들려면 `task_count_active_rel`/`difficulty_avg_rel`/`overdue_count` 같은 세부 피처가 필요하다. 이 값들은 이미 `ml_workload_score/app/services/workload_model.py`의 `build_features()`가 계산하고 있지만, 현재 `WorkloadMemberResult`(FastAPI 응답 스키마)와 `ContributionMemberResult`(기여도 점수 응답 스키마)에는 담기지 않고 버려진다. **새 계산 로직이나 새 엔드포인트 없이, 이미 계산된 값을 최종 응답까지 흘려보내는 필드 확장만 하면 된다.**

### FastAPI: `ml_workload_score/app/schema/workload_schema.py`

`WorkloadMemberResult`에 필드 추가:

```python
class WorkloadMemberResult(BaseModel):
    assignee_id: str
    task_count_total: int
    completion_rate: float
    overload_score: float
    is_anomaly: bool
    anomaly_type: str
    # --- 편중도 근거 패널용 신규 필드 (build_features()가 이미 계산하던 값) ---
    task_count_active_rel: float
    difficulty_avg_rel: float
    overdue_count: int
```

`workload_service.py`의 `WorkloadMemberResult(...)` 생성부에 위 세 필드를 `result.iterrows()`의 `row["task_count_active_rel"]`, `row["difficulty_avg_rel"]`, `row["overdue_count"]`에서 그대로 매핑한다(`build_features()` 반환 컬럼에 이미 존재 — `workload_model.py:232-234`, `:224` 참고).

### FastAPI: `contribution_score/app/schema/contribution_schema.py`

`ContributionMemberResult`에 동일한 필드 추가(신규 DB 조회 없음 — `contribution_service.compute_contribution_scores()`가 순회하는 `member: WorkloadMemberResult`에서 그대로 복사):

```python
class ContributionMemberResult(BaseModel):
    assignee_id: str
    workload_component: float
    task_component: float
    meeting_component: float
    contribution_score: float
    # --- 편중도 근거 패널용 신규 필드 ---
    anomaly_type: str
    task_count_active_rel: float
    difficulty_avg_rel: float
    overdue_count: int
```

`contribution_service.py`의 `compute_contribution_scores()`에서 `ContributionMemberResult(...)` 생성 시 `member.anomaly_type`, `member.task_count_active_rel`, `member.difficulty_avg_rel`, `member.overdue_count`를 그대로 채운다.

### Spring: `com.workflowai.contribution.ContributionMemberScoreDto`

동일한 필드를 record에 추가(순수 passthrough, 로직 없음):

```java
public record ContributionMemberScoreDto(
    String assignee_id,
    Double workload_component,
    Double task_component,
    Double meeting_component,
    Double contribution_score,
    String anomaly_type,
    Double task_count_active_rel,
    Double difficulty_avg_rel,
    Integer overdue_count
) {}
```

`FastApiContributionScoreClient`는 FastAPI 응답을 그대로 역직렬화하므로 변경 불필요 — 필드 추가만으로 자동 반영된다.

### Frontend: `contributorsApi.ts`

```ts
interface RawContributionMemberScore {
  assignee_id: string;
  workload_component: number;
  task_component: number;
  meeting_component: number;
  contribution_score: number;
  anomaly_type: string;
  task_count_active_rel: number;
  difficulty_avg_rel: number;
  overdue_count: number;
}

export interface ContributionMemberScoreDto {
  assigneeId: string;
  workloadComponent: number;
  taskComponent: number;
  meetingComponent: number;
  contributionScore: number;
  anomalyType: string;
  taskCountActiveRel: number;
  difficultyAvgRel: number;
  overdueCount: number;
}
```

`fetchContributionScore()`의 매핑 로직에 snake_case → camelCase 변환 4줄만 추가한다.

### `ContributorsView.tsx` 변경

- "업무 편중도" 셀(현재 `<div className="text-xs text-foreground text-center">`, [ContributorsView.tsx:368-370](../../../App/frontend/src/contributors/screen/ContributorsView.tsx#L368-L370))을 업무 수행/회의 참여 셀과 동일한 클릭 가능 버튼으로 변경:
  ```tsx
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      setSelectedMemberId(report.memberId);
      setDrilldown({ mode: "workload", memberId: report.memberId });
    }}
    className="w-full bg-transparent border-0 p-0 text-xs text-foreground text-center hover:underline cursor-pointer"
  >
    <span className="font-bold">{report.categories.workload}</span>
  </button>
  ```
- `drilldown.mode` 타입을 `"tasks" | "meetings" | "workload"`로 확장.
- `MemberDrilldownPanel` 렌더링 시 `mode === "workload"`이면 `workloadEvidence={contributionByMemberId[drilldown.memberId]}` prop을 추가로 전달(이미 존재하는 `contributionByMemberId`를 재사용 — 신규 상태/신규 fetch 없음).

## 에러 처리

- `fetchChecklist()`/`fetchTaskResult()` 실패: 해당 영역에만 에러 문구, 패널 유지.
- `fetchMeeting()` 실패: "회의 상세를 불러오지 못했습니다" 표시, 패널 유지.
- 편중도 근거: `contributionByMemberId[memberId]`가 없으면(페이지 진입 시 `fetchContributionScore()` 자체가 실패해 목업으로 폴백한 상태) "편중도 근거를 불러오지 못했습니다" 표시. 이 경우 재시도 버튼은 두지 않는다 — 페이지 진입 시 자동 호출된 결과가 이미 실패한 것이므로, 패널 안에서의 개별 재조회는 스코프 밖(전체 리포트 새로고침으로만 회복 가능).

## 테스트 계획

`App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`를 확장한다.

- 업무 모드
  - 업무 카드 클릭 시 `fetchChecklist()`와 `fetchTaskResult()`가 호출된다.
  - 체크리스트 항목과 작업 내용이 표시된다.
  - 링크/파일 요약이 표시된다.
  - 일부 API 실패 시 에러 문구가 표시되고 패널은 유지된다.

- 회의 모드
  - 회의 카드 클릭 시 `fetchMeeting()`이 호출된다.
  - 완료된 AI 분석 결과의 summary/decisions/todos/risks가 표시된다.
  - 분석 없음/처리중/실패 상태 메시지가 표시된다.
  - 조회 실패 시 에러 문구가 표시된다.

- 편중도 모드(신규)
  - `buildWorkloadEvidenceSentences()` 단위 테스트: `과부하 의심`/`저활동 의심`/`정상` 각각에 대해 기대하는 문장이 생성되는지(경계값 — `taskCountActiveRel`이 정확히 1.0인 경우 등 포함).
  - "업무 편중도" 셀 클릭 시 패널이 `mode: "workload"`로 열리고, 신규 네트워크 호출이 발생하지 않는지(이미 로드된 데이터 재사용 확인).
  - `anomalyType`별 배지 색상/라벨이 올바르게 표시되는지.
  - `workloadEvidence`가 `undefined`일 때 에러 문구가 표시되는지.

- 백엔드(FastAPI)
  - `workload_service.get_workload_score()`: 응답에 `task_count_active_rel`/`difficulty_avg_rel`/`overdue_count`가 포함되는지 (`test_workload_service.py` 확장).
  - `contribution_service.compute_contribution_scores()`: `WorkloadMemberResult`의 신규 필드가 `ContributionMemberResult`로 그대로 복사되는지 (`test_contribution_service.py` 확장).

- 백엔드(Spring)
  - `ContributionScoreControllerTest`: 응답 JSON에 `anomaly_type`/`task_count_active_rel`/`difficulty_avg_rel`/`overdue_count` 필드가 포함되는지 확인하는 케이스 추가(순수 필드 매핑이므로 새 실패 케이스는 없음).

## 알려진 한계

- 편중도 근거는 **팀 내 상대 비교**다(다른 프로젝트/팀과 비교하지 않는다) — 기존 `업무별 기여도 인사이트(Task Insight)` 설계 문서의 "개인 내 상대 비교"와는 다른 축이므로 혼동하지 않도록 패널 문구에서 "팀 평균 대비"라는 표현을 명시한다.
- 근거 문장은 코드 템플릿 조합이라 뉘앙스가 단조로울 수 있다 — 추후 LLM 서술형 요약으로 교체하고 싶다면 `ai_contribution_report`/`task_insight_service`와 동일한 패턴(목록/근거는 코드가 계산, LLM은 문장만 담당)으로 확장 가능하도록 `buildWorkloadEvidenceSentences()`를 순수 함수로 분리해 둔다.
- `contributionByMemberId`에 데이터가 없을 때 재시도 버튼을 제공하지 않으므로, 페이지 진입 시 기여도 점수 조회가 실패한 프로젝트에서는 편중도 근거 패널이 항상 에러 상태로 보인다 — 전체 새로고침(페이지 리로드)으로만 복구된다. 필요 시 후속 작업에서 패널 내 재조회 버튼 추가 검토.

## 성공 기준

- 심사자 기여도 화면에서 업무/회의/편중도 근거를 같은 드릴다운 패널 안에서 확인할 수 있다.
- 패널 안의 모든 상세 근거는 읽기 전용이다.
- "업무 편중도" 점수를 클릭하면 그 팀원이 왜 과부하/저활동으로 분류됐는지(또는 정상인지) 팀 평균 대비 수치 근거와 함께 즉시(추가 로딩 없이) 확인할 수 있다.
- 기존 기여도 점수/회의 참석 요약 로직은 유지된다.
- 관련 프론트/백엔드 테스트가 통과한다.
