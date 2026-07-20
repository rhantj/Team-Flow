# FS-09 기여도 점수 — 프론트엔드 연동 설계

작성일: 2026-07-21
작성자: 이은주 (FS-5, FS-09 이어받아 진행)
관련: `document_이은주/superpowers/specs/2026-07-20-contribution-score-spring-integration-design.md` (Spring 연동)

## 배경 / 목적

Spring `POST /api/v1/ai/contribution/score`(PR #132, 팀장 컨펌 대기 중)까지 완성됐지만
프론트 `ContributorsView.tsx`는 여전히 `score`/`categories`(업무·회의·문서·개발·협업)가
전부 목업(`CONTRIB_REPORTS`)이다. LLM 서술형 요약(`fetchContributionReport`)과 회의 참석
데이터(`fetchAttendanceSummary`)는 이미 실데이터로 연동돼 있으니, 같은 화면의 마지막
남은 조각(숫자 점수)을 마저 연동한다.

## 접근법

기존 두 연동 패턴을 그대로 재사용한다:
- API 클라이언트 함수는 `contributorsApi.ts`의 `fetchContributionReport`와 동일한 형태
  (POST, `apiFetch`가 `{success,data,error}` envelope을 자동으로 벗겨줌, snake_case →
  camelCase 변환).
- 로딩 시점은 `fetchAttendanceSummary`와 동일하게 **페이지 진입 시 자동 호출**
  (`useEffect`, `currentProjectId` 의존). 실패 시 조용히 목업으로 폴백(에러 배너 없음) —
  기여도 점수는 페이지를 열자마자 테이블에 바로 보여야 하는 핵심 정보라, LLM 리포트처럼
  "새로고침 버튼을 눌러야 갱신"되는 방식은 맞지 않다.

## 카테고리 축소 결정

사이드바의 카테고리 막대(현재 `task`/`meeting`/`docs`/`dev`/`collab` 5개)를
**`workload`/`task`/`meeting` 3개**로 줄인다. `contribution_score` 백엔드가 실제로 계산하는
피처와 정확히 일치시킨다 — `docs`/`collab`은 애초에 계산 안 하는 피처라 완전히 제거,
`dev`(GitHub)도 이번엔 점수 계산에서 빠져 있으므로 사이드바에서는 제거한다(테이블의
"개발" 컬럼에 있는 커밋/PR 수 표시는 카테고리 막대와 별개라 그대로 유지 — GitHub 연동 전까지
목업).

## 아키텍처

```
ContributorsView (useEffect, currentProjectId 의존)
  └─ fetchContributionScore(currentProjectId)
       └─ apiFetch POST /ai/contribution/score { project_id }
            └─ Spring → FastAPI → {schema_version, project_id, members[], note}
  └─ contributionScoresByMemberId (assignee_id 기준 Map)
  └─ mergedReports: 실데이터 있으면 score/categories 덮어씀, 없으면 목업 그대로
```

### `contributorsApi.ts`에 추가

```ts
interface RawContributionMemberScore {
  assignee_id: string;
  workload_component: number;
  task_component: number;
  meeting_component: number;
  contribution_score: number;
}

interface RawContributionScoreData {
  schema_version: string;
  project_id: number;
  members: RawContributionMemberScore[];
  note: string | null;
}

export interface ContributionMemberScoreDto {
  assigneeId: string;
  workloadComponent: number;
  taskComponent: number;
  meetingComponent: number;
  contributionScore: number;
}

export interface ContributionScoreResult {
  members: ContributionMemberScoreDto[];
  note: string | null;
}

export async function fetchContributionScore(projectId: number): Promise<ContributionScoreResult> {
  const data = await apiFetch<RawContributionScoreData>("/ai/contribution/score", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });

  return {
    members: data.members.map((m) => ({
      assigneeId: m.assignee_id,
      workloadComponent: m.workload_component,
      taskComponent: m.task_component,
      meetingComponent: m.meeting_component,
      contributionScore: m.contribution_score,
    })),
    note: data.note,
  };
}
```

`fetchContributionReport`와 마찬가지로 `apiFetch`가 이미 envelope을 벗겨주므로
`RawContributionScoreData`가 바로 `data` 필드 타입과 일치한다(Spring
`ApiResponse<ContributionScoreResponseDto>`의 `data`).

### `ContributorsView.tsx` 변경

`categories` 타입을 목업 파생 타입(`(typeof CONTRIB_REPORTS)[number]["categories"]`)에서
독립된 3키 타입으로 바꾸고, `mergedReports`에 워크로드 점수 병합 단계를 추가한다:

```ts
type CategoryKey = "workload" | "task" | "meeting";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  workload: "워크로드",
  task: "업무 수행",
  meeting: "회의 참여",
};

// ...
const [contributionScores, setContributionScores] = useState<ContributionMemberScoreDto[]>([]);
useEffect(() => {
  if (currentProjectId == null) {
    setContributionScores([]);
    return;
  }
  fetchContributionScore(currentProjectId)
    .then((result) => setContributionScores(result.members))
    .catch(() => setContributionScores([]));
}, [currentProjectId]);

const contributionByMemberId = useMemo(
  () => Object.fromEntries(contributionScores.map((s) => [s.assigneeId, s])),
  [contributionScores],
);

const mergedReports = useMemo(
  () =>
    CONTRIB_REPORTS.map((report) => {
      const override = reportOverrides[report.memberId];
      const scoreData = contributionByMemberId[report.memberId];
      return {
        ...report,
        aiSummary: override?.summary ?? report.aiSummary,
        evidence: override?.evidence ?? report.evidence,
        score: scoreData ? Math.round(scoreData.contributionScore) : report.score,
        categories: scoreData
          ? { workload: scoreData.workloadComponent, task: scoreData.taskComponent, meeting: scoreData.meetingComponent }
          : report.categories,
      };
    }),
  [reportOverrides, contributionByMemberId],
);
```

(기존 `report.memberId`가 이미 문자열이고 `assignee_id`도 문자열이라 키 매칭에 별도 변환
불필요 — `assigneeId`가 실제 유저 id를 문자열화한 값이라는 건 워크로드 스코어 설계
문서에서 이미 확인된 사실.)

### 목업 파일(`global/lib/mock/reviewer.ts`) 변경

`categories`의 `docs`/`dev`/`collab`을 제거하고 `workload`로 교체 — API 실패 시 폴백
값으로만 쓰인다(지금 `meetings`/`todoDone`이 폴백으로 쓰이는 것과 동일 역할):

```ts
categories:{ task:85, meeting:90, workload:78 }   // 김민준
categories:{ task:100, meeting:100, workload:82 } // 이서연
categories:{ task:100, meeting:83, workload:75 }  // 박지수
categories:{ task:33, meeting:67, workload:60 }   // 최동혁
```

## 에러 처리

`fetchContributionScore` 실패(네트워크 오류, 401 등) 시 `contributionScores`를 빈 배열로
두고 조용히 목업 폴백 — `fetchAttendanceSummary`와 동일한 정책. `note`(빈 프로젝트 등
사유)는 이번 스코프에서는 UI에 노출하지 않는다(추후 필요시 배너 추가 검토).

## 테스트

- `contributorsApi.test.ts`에 `fetchContributionScore` 테스트 추가 —
  `fetchContributionReport` 테스트와 동일 패턴(`apiFetch` 모킹, snake_case→camelCase 변환
  검증).
- `ContributorsView.tsx`는 기존에 컴포넌트 테스트가 없음(그대로 유지, 이번 스코프에서
  새로 안 만듦 — 기존 컨벤션과 일치).

## 스코프 밖

- GitHub(FR-13) 연동 시 `dev` 카테고리 부활 및 4피처 가중치 재실험
- `note` 필드를 실제 UI 배너로 노출하는 것
- `contribution_reports.evidence` 스냅샷 저장/이력 조회 (Spring 쪽 후속 작업, 별도 논의)
