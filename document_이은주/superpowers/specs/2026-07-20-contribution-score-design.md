# FS-09 심사자 기여도 리포트 — 기여도 점수(contribution score) 계산 모델 설계

작성일: 2026-07-20
작성자: 이은주 (FS-5, FS-09 이어받아 진행)
관련: `document_이은주/superpowers/specs/2026-07-16-workload-embedding-difficulty-design.md`, `App/backend_fastapi/ml_workload_score/`

## 배경 / 목적

FR-09(심사자 기여도 리포트)의 프론트 화면(`App/frontend/src/contributors/screen/ContributorsView.tsx`)은
현재 100% 목업 데이터(`global/lib/mock/reviewer.ts`)로 동작 중이고, 백엔드 연동이 전혀 없다. 기존 목업은
`task/meeting/docs/dev/collab` 5개 카테고리의 평균으로 점수를 표시하는데, 이번 작업은 그중 `docs`(문서
기여)·`collab`(협업 활동)을 제거하고 이미 구현된 **워크로드 스코어**(`ml_workload_score`)를 새 카테고리로
추가해 실제 데이터 기반 점수 계산 모델을 만드는 것이다.

팀 논의 결과 GitHub 연동(FR-13, P1)은 이번 스코프에서 제외했다 — 백엔드에 `github_records` 커밋/PR을
채우는 코드가 전혀 없고(스키마만 존재), 프론트도 `github/libs/mock/github.ts` 목업뿐이라 시간 내
구현이 어렵다는 판단. 따라서 이번 contribution score는 **workload / task / meeting 3개 피처**로만
산정하고, GitHub은 나중에 누군가 FR-13을 구현하면 4번째 피처로 추가한다(수식만 확장하면 되도록 설계).

## 접근법

### 피처 재사용 우선

- **workload**: `ml_workload_score.app.services.workload_service.get_workload_score()`를 함수로 직접
  import해서 재사용한다. HTTP 재호출 없음 — 같은 FastAPI 프로세스 안에서 호출.
- **task(업무 완료율)**: 워크로드 스코어 응답의 `WorkloadMemberResult.completion_rate`를 그대로 쓴다.
  `tasks` 테이블 기준으로 이미 계산되는 값이라 별도 조회가 필요 없다.
- **meeting(회의 참석)**: `meeting_attendees`/`meetings` 테이블(DB 코멘트: "회의 참석자 태깅, 기여도
  근거로도 사용")을 새로 조회해야 한다 — 워크로드 스코어 쪽에 없는 유일한 신규 데이터.

### workload 피처의 방향성 보정

`overload_score`는 "팀 평균에서 얼마나 벗어났는가"(이상치 정도)라 과부하든 저활동이든 이상치면 값이
높다. 기여도 피처로 그대로 쓰면 저활동자가 오히려 점수를 깎아먹지 않는 왜곡이 생긴다. 그래서
`anomaly_type == "저활동 의심"`일 때만 `100 - overload_score`로 감점하고, 그 외(`정상`/`과부하 의심`/
`이상 패턴`)는 `100`으로 처리한다 — 과부하는 기여도 관점에서 불이익을 주지 않는다.

### 가중치는 균등 평균이 아니라 데이터 기반으로 산출

세 피처를 단순 평균하지 않고, **비지도 학습(PCA 또는 엔트로피 가중법)**으로 가중치를 오프라인 산출해서
코드에 상수로 반영한다. 지도학습은 기각했다 — `evaluation_scores`/`contribution_reports`에 실제 라벨이
없어(워크로드 스코어 난이도 설계 때와 동일한 이유, 위 관련 문서 참고) 학습시킬 타겟이 없다. PCA/엔트로피는
라벨 없이 피처 자체의 분산/정보량으로 가중치를 정당화할 수 있다.

가중치는 **요청마다 재계산하지 않는다** — 프로젝트당 팀원이 4~9명뿐이라 매번 PCA를 돌리면 표본이 너무
작아 불안정하다(워크로드 스코어의 IsolationForest가 소표본에서 불안정했던 것과 같은 문제). 대신 노트북에서
오프라인으로 산출·검증한 값을 상수로 고정한다.

## 아키텍처

`ml_workload_score`와 동일한 3계층 구조(schema/services/routers)로 새 모듈을 만든다.

```
contribution_router.score_contribution(project_id)
  └─ workload_service.get_workload_score(project_id)        # 기존 재사용, workload+task 동시 획득
  └─ contribution_db.load_meeting_attendance(project_id)     # 신규: meeting_attendees 집계
  └─ contribution_service.compute_contribution_scores(...)   # 3피처 조합 + 확정 가중치 적용
```

### 새 파일

- `App/backend_fastapi/contribution_score/app/schema/contribution_schema.py`
- `App/backend_fastapi/contribution_score/app/services/contribution_db.py`
- `App/backend_fastapi/contribution_score/app/services/contribution_service.py`
- `App/backend_fastapi/contribution_score/app/routers/contribution_router.py`
- `App/backend_fastapi/tests/contribution_score/test_contribution_service.py`
- `App/backend_fastapi/tests/contribution_score/test_contribution_router.py`
- `document_이은주/01-contribution-weight-experiment.ipynb` — 가중치 실험 노트북
- `document_이은주/2026-07-20-contribution-weight-experiment.md` — 실험 결과 정리

### `contribution_schema.py`

```python
class ContributionMemberResult(BaseModel):
    assignee_id: str
    workload_component: float   # 0~100
    task_component: float       # 0~100
    meeting_component: float    # 0~100
    contribution_score: float   # 가중 평균, 0~100

class ContributionScoreData(BaseModel):
    schema_version: str = "1.0"   # workload_schema와 동일 패턴 — 향후 GitHub 추가 대비
    project_id: int
    members: list[ContributionMemberResult]
    note: str | None = None

class ContributionScoreResponse(BaseModel):
    success: bool
    data: ContributionScoreData | None = None
    error: dict | None = None
```

### `contribution_db.py` — 회의 참석 집계

```sql
SELECT ma.user_id AS assignee_id,
       COUNT(*) AS attended_count,
       (SELECT COUNT(*) FROM meetings WHERE project_id = :project_id) AS total_meetings
FROM meeting_attendees ma
JOIN meetings m ON m.id = ma.meeting_id
WHERE m.project_id = :project_id
GROUP BY ma.user_id
```

`workload_db.py`와 동일하게 `workload_db.get_engine()`(SQLAlchemy, dotenv_values 직접 로딩 패턴)을
재사용한다 — `2026-07-16-workload-embedding-difficulty-design.md`에서 확인했듯 이 dev 환경에서는
`core.config.get_settings()` 경로가 `.env`를 못 찾는 문제가 있어, 이미 검증된 `workload_db`의 설정
로딩 방식을 그대로 쓰는 게 안전하다.

### `contribution_service.py` — 피처 조합

```python
# 노트북 실험으로 확정되는 값 (플레이스홀더, 실험 후 갱신)
WEIGHT_WORKLOAD = 1/3
WEIGHT_TASK = 1/3
WEIGHT_MEETING = 1/3

def workload_component_of(member: WorkloadMemberResult) -> float:
    if member.anomaly_type == "저활동 의심":
        return max(0.0, 100.0 - member.overload_score)
    return 100.0

def meeting_component_of(attended: int, total: int) -> float:
    if total <= 0:
        return 100.0  # 열린 회의가 없으면 불이익 없음
    return round(attended / total * 100, 1)

def compute_contribution_scores(
    workload_data: WorkloadScoreData, attendance: dict[str, tuple[int, int]]
) -> list[ContributionMemberResult]:
    ...
    # assignee_id 기준으로 workload 결과와 attendance를 join.
    # 워크로드 스코어에는 있지만 attendance 조회 결과에 없는 팀원(회의 미참석자 포함)은
    # attended=0으로 처리(결측이 아니라 "참석 안 함"이 맞는 해석).
```

## 가중치 실험 절차 (`01-contribution-weight-experiment.ipynb`)

1. **데이터 확인**: 실 프로젝트(Supabase project_id=1)의 workload/task/meeting 3피처 매트릭스 구성.
   표본이 워크로드 스코어 검증 때처럼 부족하면(팀원 4명 수준) `workload_model.generate_synthetic_tasks()`
   패턴을 참고해 synthetic 팀원 데이터로 보강.
2. **전처리**: 3피처를 0~100 스케일로 정규화(이미 설계상 전부 0~100이므로 스케일 조정은 생략 가능,
   분산 확인만).
3. **모델링**: `sklearn.decomposition.PCA`로 1주성분 로딩 계산 / 엔트로피 가중법 계산, 둘 다 산출해서
   비교.
4. **검증**: 두 방법의 가중치 차이, 설명 분산 비율(PCA) 확인. 설명 가능하고 안정적인 쪽을 선택 —
   극단적으로 한 피처에 가중치가 쏠리면(예: 0.9 이상) 실제 서비스에서 특정 피처 하나로 점수가 좌우되는
   셈이라, 이런 경우 균등 평균으로 폴백하는 것도 고려.
5. **그래프**: 피처별 분산, PCA loading, 최종 가중치 비교 막대그래프를 `output/contribution_score/`에
   저장.
6. **결과 정리**: `document_이은주/2026-07-20-contribution-weight-experiment.md`에 산출 근거·최종
   가중치·선택 이유 기록.
7. **반영**: 확정된 가중치를 `contribution_service.py`의 `WEIGHT_*` 상수로 갱신.

## 에러 처리

- `get_workload_score()`가 실패(DB 연결 실패 등)하면 contribution 계산 전체가 불가능하므로 예외를
  그대로 전파한다(workload_router와 동일하게 500 + `CONTRIBUTION_SCORE_FAILED`).
- 회의 조회 실패는 워크로드보다 덜 치명적이지만, 이번 스코프에서는 별도 폴백을 만들지 않고 동일하게
  예외 전파한다(우선 단순하게 시작 — 필요해지면 워크로드의 `use_synthetic_fallback` 패턴을 따라간다).
- 팀원이 0명(빈 프로젝트)이면 `members=[]` + `note`로 사유 표시 (workload_schema의 기존 패턴과 동일).

## 테스트

- `contribution_service.workload_component_of()`: 저활동/과부하/정상 3가지 anomaly_type 각각의 계산
  결과 단위 테스트.
- `contribution_service.meeting_component_of()`: 총 회의 0건, 일부만 참석, 전부 참석 케이스.
- `contribution_service.compute_contribution_scores()`: workload 결과에는 있지만 회의 참석 기록이 없는
  팀원이 attended=0으로 정상 처리되는지.
- `contribution_router` 통합 테스트: `get_workload_score`와 `load_meeting_attendance`를 모킹해서
  응답 스키마·에러 응답 확인 (`test_workload_router.py` 패턴 재사용).

## 스코프 밖

- GitHub(개발 기여) 피처 추가 — FR-13 백엔드 구현 이후 별도 작업.
- Spring 쪽 `/api/projects/{projectId}/contributions` 연동 및 `contribution_reports.evidence` 스냅샷
  저장 — 이 계산 모델이 검증된 후 다음 단계.
- 프론트 `ContributorsView.tsx` 실데이터 연결, 목업(`global/lib/mock/reviewer.ts`) 교체.
- 가중치를 프로젝트별로 다르게 산출하는 것(팀마다 회의 빈도·업무 스타일이 다를 수 있음) — 이번엔 전체
  공통 가중치 하나로 시작하고, 필요성이 확인되면 후속 검토.
