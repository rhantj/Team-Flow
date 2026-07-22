# 기여도 분석 읽기 전용 근거 패널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심사자 전용 `ContributorsView`의 `MemberDrilldownPanel`을 확장해, 업무 카드/회의 카드를 클릭하면 체크리스트·작업 내용·첨부 링크/파일(업무), AI 요약·결정사항·To-do·리스크(회의) 같은 읽기 전용 근거를 펼쳐 보여주고, "업무 편중도" 점수를 클릭하면 팀 평균 대비 수치 근거로 과부하/저활동 분류 이유를 즉시 보여주도록 만든다.

**Architecture:** 업무/회의 근거는 이미 존재하는 `fetchChecklist()`/`fetchTaskResult()`/`fetchMeeting()` API를 그대로 재사용해 클릭 시 개별 fetch하는 새 하위 컴포넌트(`TaskEvidenceDetails`, `MeetingEvidenceDetails`)로 렌더링한다. 편중도 근거는 신규 fetch 없이 `ContributorsView`가 이미 로드해 둔 `contributionByMemberId`를 `workloadEvidence` prop으로 그대로 내려받아 순수 함수 `buildWorkloadEvidenceSentences()`로 문장을 생성하는 `WorkloadEvidenceDetails` 컴포넌트로 렌더링한다. 편중도 근거에 필요한 `task_count_active_rel`/`difficulty_avg_rel`/`overdue_count`는 FastAPI `build_features()`가 이미 계산하지만 응답 스키마에서 버려지고 있으므로, 새 계산/새 엔드포인트 없이 FastAPI 스키마 → FastAPI 서비스 → Spring DTO → 프론트 타입까지 그대로 흘려보내는 필드 패스스루만 추가한다.

**Tech Stack:** FastAPI(Python, Pydantic) + pytest, Spring Boot(Java 21) + JUnit5/Mockito/MockMvc(standalone), React 19 + TypeScript(Vite), Vitest + Testing Library.

## Global Constraints

- 신규 백엔드 엔드포인트를 추가하지 않는다 — 편중도 근거는 기존 `/ai/score/contribution` 응답 필드 확장만으로 처리한다.
- 업무/회의 근거는 기존 API(`fetchChecklist`, `fetchTaskResult`, `fetchMeeting`)만 재사용한다 — 신규 API 클라이언트 함수를 만들지 않는다.
- 이 패널은 철저히 읽기 전용이다 — 체크리스트 토글/인라인 편집, 작업 내용 저장, 링크·파일 추가/삭제, 회의록 To-do 업무 등록 UI를 포함하지 않는다.
- `TaskEvidenceDetails`/`MeetingEvidenceDetails`/`WorkloadEvidenceDetails`는 우선 `MemberDrilldownPanel.tsx` 한 파일 안에 정의한다(스펙 문서의 명시적 결정 — 파일이 너무 커지면 후속 작업에서 분리).
- 일부 API 실패 시 패널 전체를 닫지 않고 실패한 영역에만 에러 문구를 표시한다(이 파일의 기존 관례 — 회의 참석 상세 실패 처리와 동일한 패턴).
- 편중도 근거(`workloadEvidence`)가 없을 때는 재시도 버튼을 두지 않는다 — 페이지 진입 시 이미 실패한 조회이므로 안내 문구만 표시한다.
- 모든 새 코드의 주석/문자열은 한국어로 작성한다(기존 코드베이스 관례).
- FastAPI 테스트는 `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest <path> -v`로 실행한다(이 저장소의 venv 경로 관례).
- Spring 테스트는 `cd App/backend_spring && ./gradlew test --tests "<FQCN>"`으로 실행한다.
- 프론트엔드 테스트는 `cd App/frontend && pnpm test -- --run <파일명>`으로 실행한다.

---

### Task 1: FastAPI — `WorkloadMemberResult`에 편중도 근거 필드 추가

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/schema/workload_schema.py:9-15`
- Modify: `App/backend_fastapi/ml_workload_score/app/services/workload_service.py:59-69`
- Test: `App/backend_fastapi/tests/ml_workload_score/test_workload_service.py`
- Test: `App/backend_fastapi/tests/ml_workload_score/test_workload_router.py`

**Interfaces:**
- Produces: `WorkloadMemberResult`에 `task_count_active_rel: float`, `difficulty_avg_rel: float`, `overdue_count: int` 필드 추가(기존 6개 필드에 추가, 전부 필수 필드 — 기본값 없음).
- Consumes: `build_features()`가 이미 계산하는 DataFrame 컬럼 `task_count_active_rel`, `difficulty_avg_rel`, `overdue_count` (`App/backend_fastapi/ml_workload_score/app/services/workload_model.py:224`, `:232-234` 참고).

- [ ] **Step 1: 실패하는 테스트 작성 — `test_workload_service.py`**

`App/backend_fastapi/tests/ml_workload_score/test_workload_service.py`의 `_fake_tasks_df()` 함수는 그대로 두고, `test_get_workload_score_passes_embedding_adjustments_to_build_features` 테스트(라인 21-45) 안의 `mock_build_features.return_value` 구성을 아래처럼 컬럼을 추가해 바꾼다. 기존:

```python
        mock_build_features.return_value = pd.DataFrame([
            {"assignee_id": "1", "task_count_total": 1, "completion_rate": 0.0,
             "overload_score_0_100": 10.0, "is_anomaly": False, "anomaly_type": "정상"},
        ])
```

변경 후:

```python
        mock_build_features.return_value = pd.DataFrame([
            {"assignee_id": "1", "task_count_total": 1, "completion_rate": 0.0,
             "overload_score_0_100": 10.0, "is_anomaly": False, "anomaly_type": "정상",
             "task_count_active_rel": 1.0, "difficulty_avg_rel": 1.0, "overdue_count": 0},
        ])
```

같은 파일 끝(`test_get_workload_score_synthetic_fallback_still_works` 테스트, 라인 48-62) 바로 뒤에 새 테스트를 추가한다:

```python


@pytest.mark.asyncio
async def test_get_workload_score_includes_workload_evidence_fields():
    """편중도 근거 패널이 필요로 하는 세 필드가 응답까지 그대로 전달되는지 확인한다."""
    with patch(
        "ml_workload_score.app.services.workload_service.db.load_tasks_from_db",
        return_value=_fake_tasks_df(),
    ), patch(
        "ml_workload_score.app.services.workload_service.compute_embedding_adjustments",
        AsyncMock(return_value={}),
    ), patch(
        "ml_workload_score.app.services.workload_service.build_features",
    ) as mock_build_features:
        mock_build_features.return_value = pd.DataFrame([
            {"assignee_id": "1", "task_count_total": 4, "completion_rate": 0.5,
             "overload_score_0_100": 82.5, "is_anomaly": True, "anomaly_type": "과부하 의심",
             "task_count_active_rel": 1.8, "difficulty_avg_rel": 1.4, "overdue_count": 2},
        ])
        with patch(
            "ml_workload_score.app.services.workload_service.detect_overload_anomalies_auto",
        ) as mock_detect:
            mock_detect.return_value = mock_build_features.return_value
            mock_detect.return_value.attrs = {"method_used": "MAD"}
            result = await get_workload_score(project_id=1)

    member = result.members[0]
    assert member.task_count_active_rel == pytest.approx(1.8)
    assert member.difficulty_avg_rel == pytest.approx(1.4)
    assert member.overdue_count == 2
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_workload_service.py -v`
Expected: FAIL — `test_get_workload_score_includes_workload_evidence_fields`가 `pydantic.ValidationError`(필드 없음) 또는 `AttributeError: 'WorkloadMemberResult' object has no attribute 'task_count_active_rel'`로 실패. 기존 테스트(`test_get_workload_score_passes_embedding_adjustments_to_build_features`)는 이 시점엔 아직 통과(스키마가 안 바뀌었으므로 추가 컬럼은 단순히 무시됨).

- [ ] **Step 3: `test_workload_router.py`도 새 필드 없이는 곧 깨질 것이므로 함께 갱신**

`App/backend_fastapi/tests/ml_workload_score/test_workload_router.py`의 `test_score_workload_returns_success_when_service_succeeds`(라인 16-43) 안의 `WorkloadMemberResult(...)` 생성부를 아래처럼 바꾼다. 기존:

```python
            WorkloadMemberResult(
                assignee_id="3",
                task_count_total=10,
                completion_rate=0.4,
                overload_score=82.5,
                is_anomaly=True,
                anomaly_type="과부하 의심",
            )
```

변경 후:

```python
            WorkloadMemberResult(
                assignee_id="3",
                task_count_total=10,
                completion_rate=0.4,
                overload_score=82.5,
                is_anomaly=True,
                anomaly_type="과부하 의심",
                task_count_active_rel=1.8,
                difficulty_avg_rel=1.4,
                overdue_count=2,
            )
```

- [ ] **Step 4: 스키마에 필드 추가**

`App/backend_fastapi/ml_workload_score/app/schema/workload_schema.py`의 `WorkloadMemberResult`를 아래처럼 바꾼다. 기존:

```python
class WorkloadMemberResult(BaseModel):
    assignee_id: str
    task_count_total: int
    completion_rate: float
    overload_score: float
    is_anomaly: bool
    anomaly_type: str
```

변경 후:

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

- [ ] **Step 5: 서비스에서 필드 매핑 추가**

`App/backend_fastapi/ml_workload_score/app/services/workload_service.py`의 `WorkloadMemberResult(...)` 생성부(라인 60-67)를 아래처럼 바꾼다. 기존:

```python
    members = [
        WorkloadMemberResult(
            assignee_id=row["assignee_id"],
            task_count_total=int(row["task_count_total"]),
            completion_rate=round(float(row["completion_rate"]), 3),
            overload_score=round(float(row["overload_score_0_100"]), 1),
            is_anomaly=bool(row["is_anomaly"]),
            anomaly_type=row["anomaly_type"],
        )
        for _, row in result.iterrows()
    ]
```

변경 후:

```python
    members = [
        WorkloadMemberResult(
            assignee_id=row["assignee_id"],
            task_count_total=int(row["task_count_total"]),
            completion_rate=round(float(row["completion_rate"]), 3),
            overload_score=round(float(row["overload_score_0_100"]), 1),
            is_anomaly=bool(row["is_anomaly"]),
            anomaly_type=row["anomaly_type"],
            task_count_active_rel=round(float(row["task_count_active_rel"]), 3),
            difficulty_avg_rel=round(float(row["difficulty_avg_rel"]), 3),
            overdue_count=int(row["overdue_count"]),
        )
        for _, row in result.iterrows()
    ]
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_workload_service.py tests/ml_workload_score/test_workload_router.py -v`
Expected: PASS (기존 테스트 포함 전체 통과)

- [ ] **Step 7: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/schema/workload_schema.py App/backend_fastapi/ml_workload_score/app/services/workload_service.py App/backend_fastapi/tests/ml_workload_score/test_workload_service.py App/backend_fastapi/tests/ml_workload_score/test_workload_router.py
git commit -m "feat: WorkloadMemberResult에 편중도 근거 필드(task_count_active_rel/difficulty_avg_rel/overdue_count) 패스스루 추가"
```

---

### Task 2: FastAPI — `ContributionMemberResult`에 편중도 근거 필드 패스스루

**Files:**
- Modify: `App/backend_fastapi/contribution_score/app/schema/contribution_schema.py:8-13`
- Modify: `App/backend_fastapi/contribution_score/app/services/contribution_service.py:51-58`
- Test: `App/backend_fastapi/tests/contribution_score/test_contribution_service.py`
- Test: `App/backend_fastapi/tests/contribution_score/test_contribution_router.py`

**Interfaces:**
- Consumes: `WorkloadMemberResult.anomaly_type/task_count_active_rel/difficulty_avg_rel/overdue_count` (Task 1에서 추가됨)
- Produces: `ContributionMemberResult`에 `anomaly_type: str`, `task_count_active_rel: float`, `difficulty_avg_rel: float`, `overdue_count: int` 필드 추가.

- [ ] **Step 1: `_member()` 헬퍼와 관련 테스트를 실패하도록 먼저 갱신**

`App/backend_fastapi/tests/contribution_score/test_contribution_service.py`의 `_member()` 헬퍼(라인 13-21)를 아래처럼 바꾼다. 기존:

```python
def _member(assignee_id="1", completion_rate=0.5, overload_score=0.0, anomaly_type="정상") -> WorkloadMemberResult:
    return WorkloadMemberResult(
        assignee_id=assignee_id,
        task_count_total=10,
        completion_rate=completion_rate,
        overload_score=overload_score,
        is_anomaly=anomaly_type != "정상",
        anomaly_type=anomaly_type,
    )
```

변경 후:

```python
def _member(assignee_id="1", completion_rate=0.5, overload_score=0.0, anomaly_type="정상") -> WorkloadMemberResult:
    return WorkloadMemberResult(
        assignee_id=assignee_id,
        task_count_total=10,
        completion_rate=completion_rate,
        overload_score=overload_score,
        is_anomaly=anomaly_type != "정상",
        anomaly_type=anomaly_type,
        task_count_active_rel=1.2,
        difficulty_avg_rel=1.1,
        overdue_count=1,
    )
```

같은 파일의 `test_compute_contribution_scores_missing_attendance_defaults_to_zero` 테스트(라인 56-70) 끝에 신규 필드 패스스루 검증을 추가한다. 기존 마지막 두 줄:

```python
    expected = svc.WEIGHT_WORKLOAD * 100.0 + svc.WEIGHT_TASK * 80.0 + svc.WEIGHT_MEETING * 0.0
    assert result.contribution_score == pytest.approx(expected, abs=0.1)
```

변경 후(끝에 추가):

```python
    expected = svc.WEIGHT_WORKLOAD * 100.0 + svc.WEIGHT_TASK * 80.0 + svc.WEIGHT_MEETING * 0.0
    assert result.contribution_score == pytest.approx(expected, abs=0.1)
    assert result.anomaly_type == "정상"
    assert result.task_count_active_rel == pytest.approx(1.2)
    assert result.difficulty_avg_rel == pytest.approx(1.1)
    assert result.overdue_count == 1
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_service.py -v`
Expected: FAIL — `_member()` 호출부에서 `WorkloadMemberResult`에 없는 인자(`task_count_active_rel` 등)로 `TypeError`, 또는 새로 추가한 asserts가 `AttributeError: 'ContributionMemberResult' object has no attribute 'anomaly_type'`로 실패.

- [ ] **Step 3: `test_contribution_router.py`의 `_fake_workload_data()`도 갱신**

`App/backend_fastapi/tests/contribution_score/test_contribution_router.py`의 `_fake_workload_data()`(라인 13-24) 안의 `WorkloadMemberResult(...)` 생성부를 아래처럼 바꾼다. 기존:

```python
            WorkloadMemberResult(
                assignee_id="3", task_count_total=10, completion_rate=0.8,
                overload_score=10.0, is_anomaly=False, anomaly_type="정상",
            )
```

변경 후:

```python
            WorkloadMemberResult(
                assignee_id="3", task_count_total=10, completion_rate=0.8,
                overload_score=10.0, is_anomaly=False, anomaly_type="정상",
                task_count_active_rel=1.0, difficulty_avg_rel=1.0, overdue_count=0,
            )
```

- [ ] **Step 4: 스키마에 필드 추가**

`App/backend_fastapi/contribution_score/app/schema/contribution_schema.py`의 `ContributionMemberResult`를 아래처럼 바꾼다. 기존:

```python
class ContributionMemberResult(BaseModel):
    assignee_id: str
    workload_component: float
    task_component: float
    meeting_component: float
    contribution_score: float
```

변경 후:

```python
class ContributionMemberResult(BaseModel):
    assignee_id: str
    workload_component: float
    task_component: float
    meeting_component: float
    contribution_score: float
    # --- 편중도 근거 패널용 신규 필드 (WorkloadMemberResult에서 그대로 복사) ---
    anomaly_type: str
    task_count_active_rel: float
    difficulty_avg_rel: float
    overdue_count: int
```

- [ ] **Step 5: 서비스에서 필드 복사 추가**

`App/backend_fastapi/contribution_score/app/services/contribution_service.py`의 `compute_contribution_scores()` 안 `ContributionMemberResult(...)` 생성부(라인 51-58)를 아래처럼 바꾼다. 기존:

```python
        results.append(
            ContributionMemberResult(
                assignee_id=member.assignee_id,
                workload_component=workload_comp,
                task_component=task_comp,
                meeting_component=meeting_comp,
                contribution_score=score,
            )
        )
```

변경 후:

```python
        results.append(
            ContributionMemberResult(
                assignee_id=member.assignee_id,
                workload_component=workload_comp,
                task_component=task_comp,
                meeting_component=meeting_comp,
                contribution_score=score,
                anomaly_type=member.anomaly_type,
                task_count_active_rel=member.task_count_active_rel,
                difficulty_avg_rel=member.difficulty_avg_rel,
                overdue_count=member.overdue_count,
            )
        )
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_service.py tests/contribution_score/test_contribution_router.py -v`
Expected: PASS (기존 테스트 포함 전체 통과)

- [ ] **Step 7: 커밋**

```bash
git add App/backend_fastapi/contribution_score/app/schema/contribution_schema.py App/backend_fastapi/contribution_score/app/services/contribution_service.py App/backend_fastapi/tests/contribution_score/test_contribution_service.py App/backend_fastapi/tests/contribution_score/test_contribution_router.py
git commit -m "feat: ContributionMemberResult에 편중도 근거 필드 패스스루 추가"
```

---

### Task 3: Spring — `ContributionMemberScoreDto`에 편중도 근거 필드 추가

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionMemberScoreDto.java`
- Modify: `App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreControllerTest.java:30-35`

**Interfaces:**
- Consumes: FastAPI `/ai/score/contribution` 응답의 `anomaly_type`/`task_count_active_rel`/`difficulty_avg_rel`/`overdue_count` (Task 2에서 추가됨, Jackson이 필드명으로 자동 역직렬화 — `FastApiContributionScoreClient` 코드 변경 불필요).
- Produces: `ContributionMemberScoreDto`에 4개 필드 추가(순수 passthrough record, 로직 없음).

- [ ] **Step 1: 컨트롤러 테스트를 새 필드 포함하도록 먼저 갱신(컴파일 실패 예정)**

`App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreControllerTest.java`의 `getScoreReturnsDataFromFastApi` 테스트(라인 28-50) 안 `ContributionMemberScoreDto` 생성부를 아래처럼 바꾼다. 기존:

```java
        ContributionScoreResponseDto fastApiResponse = new ContributionScoreResponseDto(
            "1.0",
            1L,
            List.of(new ContributionMemberScoreDto("3", 100.0, 80.0, 80.0, 86.7)),
            null
        );
```

변경 후:

```java
        ContributionScoreResponseDto fastApiResponse = new ContributionScoreResponseDto(
            "1.0",
            1L,
            List.of(new ContributionMemberScoreDto("3", 100.0, 80.0, 80.0, 86.7, "정상", 1.0, 1.0, 0)),
            null
        );
```

같은 테스트의 마지막 assertion 블록 뒤에 신규 필드가 응답 JSON에 포함되는지 확인하는 assertion을 추가한다. 기존:

```java
            .andExpect(jsonPath("$.data.members[0].assignee_id").value("3"))
            .andExpect(jsonPath("$.data.members[0].contribution_score").value(86.7));
```

변경 후:

```java
            .andExpect(jsonPath("$.data.members[0].assignee_id").value("3"))
            .andExpect(jsonPath("$.data.members[0].contribution_score").value(86.7))
            .andExpect(jsonPath("$.data.members[0].anomaly_type").value("정상"))
            .andExpect(jsonPath("$.data.members[0].task_count_active_rel").value(1.0))
            .andExpect(jsonPath("$.data.members[0].difficulty_avg_rel").value(1.0))
            .andExpect(jsonPath("$.data.members[0].overdue_count").value(0));
```

- [ ] **Step 2: 테스트가 컴파일 실패하는지 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionScoreControllerTest"`
Expected: FAIL — `cannot find symbol` 또는 생성자 인자 개수 불일치로 컴파일 에러(`ContributionMemberScoreDto`가 아직 5개 필드만 받음).

- [ ] **Step 3: record에 필드 추가**

`App/backend_spring/src/main/java/com/workflowai/contribution/ContributionMemberScoreDto.java` 전체를 아래로 교체한다:

```java
package com.workflowai.contribution;

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

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionScoreControllerTest"`
Expected: PASS (3개 테스트 모두 통과 — `getScoreReturnsDataFromFastApi`, `getScoreReturns503WhenFastApiFails`, `getScoreReturns429WhenRateLimited`)

- [ ] **Step 5: 커밋**

```bash
git add App/backend_spring/src/main/java/com/workflowai/contribution/ContributionMemberScoreDto.java App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreControllerTest.java
git commit -m "feat: ContributionMemberScoreDto에 편중도 근거 필드 패스스루 추가"
```

---

### Task 4: Frontend — `contributorsApi.ts`에 편중도 근거 필드 매핑 추가

**Files:**
- Modify: `App/frontend/src/contributors/libs/utils/contributorsApi.ts:31-52,66-72`
- Test: `App/frontend/src/contributors/libs/utils/contributorsApi.test.ts:36-70`

**Interfaces:**
- Consumes: Spring/FastAPI 응답의 `anomaly_type`/`task_count_active_rel`/`difficulty_avg_rel`/`overdue_count` (Task 2, 3에서 추가됨).
- Produces: `ContributionMemberScoreDto`에 `anomalyType: string`, `taskCountActiveRel: number`, `difficultyAvgRel: number`, `overdueCount: number` 필드 추가 — Task 6/7에서 `workloadEvidence` prop으로 그대로 쓰인다.

- [ ] **Step 1: 실패하는 테스트로 먼저 갱신**

`App/frontend/src/contributors/libs/utils/contributorsApi.test.ts`의 `"converts snake_case response to camelCase"` 테스트(라인 36-70, `fetchContributionScore` describe 블록 안)를 아래처럼 바꾼다. 기존:

```ts
  it("converts snake_case response to camelCase", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      schema_version: "1.0",
      project_id: 1,
      members: [
        {
          assignee_id: "3",
          workload_component: 100.0,
          task_component: 80.0,
          meeting_component: 80.0,
          contribution_score: 86.7,
        },
      ],
      note: null,
    });

    const result = await fetchContributionScore(1);

    expect(apiFetch).toHaveBeenCalledWith("/ai/contribution/score", {
      method: "POST",
      body: JSON.stringify({ project_id: 1 }),
    });
    expect(result).toEqual({
      members: [
        {
          assigneeId: "3",
          workloadComponent: 100.0,
          taskComponent: 80.0,
          meetingComponent: 80.0,
          contributionScore: 86.7,
        },
      ],
      note: null,
    });
  });
```

변경 후:

```ts
  it("converts snake_case response to camelCase", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      schema_version: "1.0",
      project_id: 1,
      members: [
        {
          assignee_id: "3",
          workload_component: 100.0,
          task_component: 80.0,
          meeting_component: 80.0,
          contribution_score: 86.7,
          anomaly_type: "과부하 의심",
          task_count_active_rel: 1.8,
          difficulty_avg_rel: 1.4,
          overdue_count: 2,
        },
      ],
      note: null,
    });

    const result = await fetchContributionScore(1);

    expect(apiFetch).toHaveBeenCalledWith("/ai/contribution/score", {
      method: "POST",
      body: JSON.stringify({ project_id: 1 }),
    });
    expect(result).toEqual({
      members: [
        {
          assigneeId: "3",
          workloadComponent: 100.0,
          taskComponent: 80.0,
          meetingComponent: 80.0,
          contributionScore: 86.7,
          anomalyType: "과부하 의심",
          taskCountActiveRel: 1.8,
          difficultyAvgRel: 1.4,
          overdueCount: 2,
        },
      ],
      note: null,
    });
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run contributorsApi.test.ts`
Expected: FAIL — `result`에 `anomalyType`/`taskCountActiveRel`/`difficultyAvgRel`/`overdueCount`가 없어 `toEqual` 불일치.

- [ ] **Step 3: 타입/매핑 로직에 필드 추가**

`App/frontend/src/contributors/libs/utils/contributorsApi.ts`의 `RawContributionMemberScore`(라인 31-37)를 아래처럼 바꾼다. 기존:

```ts
interface RawContributionMemberScore {
  assignee_id: string;
  workload_component: number;
  task_component: number;
  meeting_component: number;
  contribution_score: number;
}
```

변경 후:

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
```

같은 파일의 `ContributionMemberScoreDto`(라인 46-52)를 아래처럼 바꾼다. 기존:

```ts
export interface ContributionMemberScoreDto {
  assigneeId: string;
  workloadComponent: number;
  taskComponent: number;
  meetingComponent: number;
  contributionScore: number;
}
```

변경 후:

```ts
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

`fetchContributionScore()`의 매핑 로직(라인 66-72)을 아래처럼 바꾼다. 기존:

```ts
    members: data.members.map((m) => ({
      assigneeId: m.assignee_id,
      workloadComponent: m.workload_component,
      taskComponent: m.task_component,
      meetingComponent: m.meeting_component,
      contributionScore: m.contribution_score,
    })),
```

변경 후:

```ts
    members: data.members.map((m) => ({
      assigneeId: m.assignee_id,
      workloadComponent: m.workload_component,
      taskComponent: m.task_component,
      meetingComponent: m.meeting_component,
      contributionScore: m.contribution_score,
      anomalyType: m.anomaly_type,
      taskCountActiveRel: m.task_count_active_rel,
      difficultyAvgRel: m.difficulty_avg_rel,
      overdueCount: m.overdue_count,
    })),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run contributorsApi.test.ts`
Expected: PASS (두 describe 블록의 3개 테스트 모두 통과 — `"passes through a non-null note"`는 `members: []`라 영향 없음)

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/libs/utils/contributorsApi.ts App/frontend/src/contributors/libs/utils/contributorsApi.test.ts
git commit -m "feat: ContributionMemberScoreDto에 편중도 근거 필드 매핑 추가"
```

---

### Task 5: Frontend — `buildWorkloadEvidenceSentences()` 순수 함수 + 단위 테스트

**Files:**
- Modify: `App/frontend/src/contributors/components/MemberDrilldownPanel.tsx` (파일 상단, import 아래)
- Test: `App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`

**Interfaces:**
- Produces: `export function buildWorkloadEvidenceSentences(input: WorkloadEvidenceInput): string[]`, `export interface WorkloadEvidenceInput { anomalyType: string; taskCountActiveRel: number; difficultyAvgRel: number; overdueCount: number; completionRate: number }` — Task 7의 `WorkloadEvidenceDetails` 컴포넌트가 이 함수를 사용한다.

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`의 최상단 import 블록에 아래 한 줄을 추가한다. 기존:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemberDrilldownPanel } from "./MemberDrilldownPanel";
import { fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import type { Task } from "../../board/libs/types/task";
```

변경 후:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemberDrilldownPanel, buildWorkloadEvidenceSentences } from "./MemberDrilldownPanel";
import { fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import type { Task } from "../../board/libs/types/task";
```

파일 끝(`describe("MemberDrilldownPanel", ...)` 블록이 끝나는 마지막 `});` 바로 뒤)에 새 `describe` 블록을 추가한다:

```tsx

describe("buildWorkloadEvidenceSentences", () => {
  it("과부하 의심: 업무량/난이도/지연/완료율 문장을 모두 생성한다", () => {
    const sentences = buildWorkloadEvidenceSentences({
      anomalyType: "과부하 의심",
      taskCountActiveRel: 1.8,
      difficultyAvgRel: 1.4,
      overdueCount: 2,
      completionRate: 0.4,
    });

    expect(sentences).toEqual([
      "진행 중인 업무가 팀 평균 대비 1.8배 많습니다.",
      "담당 업무의 평균 난이도가 팀 평균보다 1.4배 높습니다.",
      "마감이 지난 업무가 2건 있습니다.",
      "업무 완료율은 40%로 팀 평균보다 낮습니다.",
    ]);
  });

  it("과부하 의심이지만 업무량/난이도가 평균 이하이고 지연도 없으면 완료율 문장만 생성한다", () => {
    const sentences = buildWorkloadEvidenceSentences({
      anomalyType: "과부하 의심",
      taskCountActiveRel: 1.0,
      difficultyAvgRel: 1.0,
      overdueCount: 0,
      completionRate: 0.3,
    });

    expect(sentences).toEqual(["업무 완료율은 30%로 팀 평균보다 낮습니다."]);
  });

  it("저활동 의심: 업무량 감소와 완료율 문장을 생성한다", () => {
    const sentences = buildWorkloadEvidenceSentences({
      anomalyType: "저활동 의심",
      taskCountActiveRel: 0.3,
      difficultyAvgRel: 0.9,
      overdueCount: 0,
      completionRate: 0.95,
    });

    expect(sentences).toEqual([
      "진행 중인 업무가 팀 평균 대비 0.3배 적습니다.",
      "업무 완료율은 95%로 팀 평균보다 높습니다.",
    ]);
  });

  it("정상: 편중이 없다는 문장 하나만 생성한다", () => {
    const sentences = buildWorkloadEvidenceSentences({
      anomalyType: "정상",
      taskCountActiveRel: 1.0,
      difficultyAvgRel: 1.0,
      overdueCount: 0,
      completionRate: 0.8,
    });

    expect(sentences).toEqual(["팀 평균과 비교했을 때 업무량·난이도·완료율 모두 특별한 편중이 없습니다."]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: FAIL — `buildWorkloadEvidenceSentences`가 `MemberDrilldownPanel.tsx`에서 export되지 않아 `SyntaxError` 또는 `undefined is not a function`.

- [ ] **Step 3: 순수 함수 구현**

`App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`의 최상단 import 블록(현재 라인 1-6) 바로 뒤, `const STATUS_ORDER` 선언(현재 라인 8) 앞에 아래 타입/함수를 추가한다:

```ts
export interface WorkloadEvidenceInput {
  anomalyType: string;
  taskCountActiveRel: number;
  difficultyAvgRel: number;
  overdueCount: number;
  completionRate: number;
}

// LLM 미개입 결정론적 문장 생성기 — 근거가 이미 계산된 수치이므로 자연어 생성에
// 불확실성을 끌어들일 이유가 없다.
export function buildWorkloadEvidenceSentences(input: WorkloadEvidenceInput): string[] {
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: PASS (기존 5개 + 신규 4개 단위 테스트 모두 통과)

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/components/MemberDrilldownPanel.tsx App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx
git commit -m "feat: buildWorkloadEvidenceSentences 순수 함수 추가"
```

---

### Task 6: Frontend — `TaskEvidenceDetails` (체크리스트/작업 내용/링크/파일 읽기 전용 표시)

**Files:**
- Modify: `App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`
- Test: `App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`

**Interfaces:**
- Consumes: `fetchChecklist(taskId, projectId): Promise<ChecklistItem[]>` (`App/frontend/src/board/libs/utils/checklistApi.ts`), `fetchTaskResult(taskId, projectId): Promise<TaskResultDto>` (`App/frontend/src/board/libs/utils/taskResultApi.ts`).
- Produces: `TaskEvidenceDetails({ taskId, projectId }: { taskId: string; projectId: number })` 컴포넌트. `MemberDrilldownPanel`이 관리하는 `selectedTaskId: string | null` 상태에 따라 업무 카드 아래에 조건부로 마운트된다(Task 8에서 배선).

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`의 mock 블록(현재 라인 7-9)을 아래처럼 확장한다. 기존:

```tsx
vi.mock("../../meetings/libs/utils/meetingAiApi", () => ({
  fetchAttendanceDetail: vi.fn(),
}));
```

변경 후:

```tsx
vi.mock("../../meetings/libs/utils/meetingAiApi", () => ({
  fetchAttendanceDetail: vi.fn(),
}));

vi.mock("../../board/libs/utils/checklistApi", () => ({
  fetchChecklist: vi.fn(),
}));

vi.mock("../../board/libs/utils/taskResultApi", () => ({
  fetchTaskResult: vi.fn(),
}));
```

import 블록에도 새 mock 함수를 추가한다. 기존:

```tsx
import { fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import type { Task } from "../../board/libs/types/task";
```

변경 후:

```tsx
import { fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
import { fetchChecklist } from "../../board/libs/utils/checklistApi";
import { fetchTaskResult } from "../../board/libs/utils/taskResultApi";
import type { Task } from "../../board/libs/types/task";
```

`describe("MemberDrilldownPanel", ...)` 블록 안, 첫 번째 테스트(`"groups tasks by status in tasks mode"`, 현재 라인 20-39) 바로 뒤에 아래 테스트들을 추가한다:

```tsx

  it("업무 카드 클릭 시 fetchChecklist와 fetchTaskResult를 호출하고 읽기 전용 근거를 표시한다", async () => {
    vi.mocked(fetchChecklist).mockResolvedValue([
      { id: "c1", label: "API 설계", done: true },
      { id: "c2", label: "테스트 작성", done: false },
    ]);
    vi.mocked(fetchTaskResult).mockResolvedValue({
      content: "파이프라인 구축 완료",
      updatedAt: "2026-12-01T00:00:00Z",
      links: [{ id: "l1", url: "https://github.com/example/repo", title: "PR 링크" }],
      files: [{ id: "f1", fileName: "report.pdf", size: 2048, contentType: "application/pdf" }],
    });
    const user = userEvent.setup();
    const tasks = [makeTask("A", "AI 모델 학습 파이프라인 구축", "done")];

    render(
      <MemberDrilldownPanel mode="tasks" memberName="김민준" memberTasks={tasks} projectId={1} userId={1} onClose={() => {}} />
    );
    await user.click(screen.getByText("AI 모델 학습 파이프라인 구축"));

    await waitFor(() => expect(screen.getByText("API 설계")).toBeInTheDocument());
    expect(fetchChecklist).toHaveBeenCalledWith("A", 1);
    expect(fetchTaskResult).toHaveBeenCalledWith("A", 1);
    expect(screen.getByText("테스트 작성")).toBeInTheDocument();
    expect(screen.getByText("파이프라인 구축 완료")).toBeInTheDocument();
    expect(screen.getByText("PR 링크")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("체크리스트 조회가 실패해도 패널은 유지되고 실패한 영역에만 에러 문구가 표시된다", async () => {
    vi.mocked(fetchChecklist).mockRejectedValue(new Error("network error"));
    vi.mocked(fetchTaskResult).mockResolvedValue({
      content: "파이프라인 리팩토링 완료", updatedAt: null, links: [], files: [],
    });
    const user = userEvent.setup();
    const tasks = [makeTask("A", "AI 모델 학습 파이프라인 구축", "done")];

    render(
      <MemberDrilldownPanel mode="tasks" memberName="김민준" memberTasks={tasks} projectId={1} userId={1} onClose={() => {}} />
    );
    await user.click(screen.getByText("AI 모델 학습 파이프라인 구축"));

    await waitFor(() => expect(screen.getByText("체크리스트를 불러오지 못했습니다.")).toBeInTheDocument());
    expect(screen.getByText("파이프라인 리팩토링 완료")).toBeInTheDocument();
  });
```

이 테스트가 참조하는 `userEvent`를 파일 상단 import에도 추가한다. 기존:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
```

변경 후:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: FAIL — 업무 카드가 아직 클릭 가능한 버튼이 아니고 `TaskEvidenceDetails`가 없어 체크리스트/작업 내용이 렌더링되지 않음.

- [ ] **Step 3: `TaskEvidenceDetails` 컴포넌트 구현 및 업무 카드를 클릭 가능하게 변경**

`App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`의 import 블록을 아래처럼 확장한다. 기존(Task 5에서 이미 수정된 상태):

```tsx
import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle } from "lucide-react";
import { TaskStatusPill } from "../../board/components/TaskStatusPill";
import { PriorityBadge } from "../../board/components/PriorityBadge";
import { fetchAttendanceDetail, type MeetingAttendanceDetailDto } from "../../meetings/libs/utils/meetingAiApi";
import type { Task, TaskStatus } from "../../board/libs/types/task";
```

변경 후:

```tsx
import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, Link2, FileText } from "lucide-react";
import { TaskStatusPill } from "../../board/components/TaskStatusPill";
import { PriorityBadge } from "../../board/components/PriorityBadge";
import { fetchAttendanceDetail, type MeetingAttendanceDetailDto } from "../../meetings/libs/utils/meetingAiApi";
import { fetchChecklist } from "../../board/libs/utils/checklistApi";
import { fetchTaskResult, type TaskResultDto } from "../../board/libs/utils/taskResultApi";
import type { ChecklistItem, Task, TaskStatus } from "../../board/libs/types/task";
```

`STATUS_ORDER` 선언 바로 뒤, `WorkloadEvidenceInput`/`buildWorkloadEvidenceSentences` 다음 위치에 `TaskEvidenceDetails` 컴포넌트를 추가한다:

```tsx
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TaskEvidenceDetailsProps {
  taskId: string;
  projectId: number;
}

// 심사자용 읽기 전용 업무 근거 — 체크리스트 토글/작업 내용 저장/링크·파일 추가 삭제는 제공하지 않는다.
function TaskEvidenceDetails({ taskId, projectId }: TaskEvidenceDetailsProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistStatus, setChecklistStatus] = useState<"loading" | "ready" | "error">("loading");
  const [taskResult, setTaskResult] = useState<TaskResultDto | null>(null);
  const [resultStatus, setResultStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setChecklistStatus("loading");
    fetchChecklist(taskId, projectId)
      .then((items) => { setChecklist(items); setChecklistStatus("ready"); })
      .catch(() => setChecklistStatus("error"));

    setResultStatus("loading");
    fetchTaskResult(taskId, projectId)
      .then((result) => { setTaskResult(result); setResultStatus("ready"); })
      .catch(() => setResultStatus("error"));
  }, [taskId, projectId]);

  return (
    <div className="mt-2 ml-3 pl-3 border-l-2 border-border space-y-3">
      <div>
        <div className="text-[10px] font-bold text-muted-foreground mb-1">체크리스트</div>
        {checklistStatus === "loading" && <p className="text-[11px] text-muted-foreground">불러오는 중...</p>}
        {checklistStatus === "error" && <p className="text-[11px] text-red-600">체크리스트를 불러오지 못했습니다.</p>}
        {checklistStatus === "ready" && checklist.length === 0 && (
          <p className="text-[11px] text-muted-foreground">체크리스트가 없습니다.</p>
        )}
        {checklistStatus === "ready" && checklist.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5 py-0.5">
            {item.done ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
            <span className={`text-[11px] ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div>
        <div className="text-[10px] font-bold text-muted-foreground mb-1">작업 내용</div>
        {resultStatus === "loading" && <p className="text-[11px] text-muted-foreground">불러오는 중...</p>}
        {resultStatus === "error" && <p className="text-[11px] text-red-600">작업 내용을 불러오지 못했습니다.</p>}
        {resultStatus === "ready" && taskResult && (
          <>
            {taskResult.content ? (
              <p className="text-[11px] text-foreground whitespace-pre-wrap">{taskResult.content}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">작성된 작업 내용이 없습니다.</p>
            )}
            {taskResult.links.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {taskResult.links.map((link) => (
                  <div key={link.id} className="flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-foreground truncate">{link.title}</span>
                  </div>
                ))}
              </div>
            )}
            {taskResult.files.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {taskResult.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-foreground truncate">{file.fileName}</span>
                    <span className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

`MemberDrilldownPanel` 컴포넌트 본문에 `selectedTaskId` 상태를 추가한다. 기존 상태 선언:

```tsx
  const [attendance, setAttendance] = useState<MeetingAttendanceDetailDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
```

변경 후:

```tsx
  const [attendance, setAttendance] = useState<MeetingAttendanceDetailDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
```

업무 카드 렌더링부(현재)를 클릭 가능하게 바꾼다. 기존:

```tsx
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
```

변경 후:

```tsx
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">해당 상태의 업무가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId((cur) => (cur === task.id ? null : task.id))}
                          className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted transition-colors"
                        >
                          <span className="text-xs font-medium text-foreground truncate">{task.title}</span>
                          <PriorityBadge priority={task.priority} />
                        </button>
                        {selectedTaskId === task.id && (
                          <TaskEvidenceDetails taskId={task.id} projectId={projectId} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: PASS (기존 테스트 + Task 5 단위 테스트 + 이번 Step 1의 신규 테스트 모두 통과)

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/components/MemberDrilldownPanel.tsx App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx
git commit -m "feat: 업무 카드 클릭 시 체크리스트/작업 내용/링크/파일 읽기 전용 근거 표시"
```

---

### Task 7: Frontend — `MeetingEvidenceDetails` (AI 분석 요약/결정사항/To-do/리스크 읽기 전용 표시)

**Files:**
- Modify: `App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`
- Test: `App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`

**Interfaces:**
- Consumes: `fetchMeeting(projectId, meetingId): Promise<MeetingAnalysisResponse>` (`App/frontend/src/meetings/libs/utils/meetingAiApi.ts:74-76`), `MeetingAiResult { summary, decisions, todos, risks, keywords, meeting_meta }` (`App/frontend/src/meetings/libs/types/meetingAiTypes.ts`).
- Produces: `MeetingEvidenceDetails({ projectId, meetingId }: { projectId: number; meetingId: string })` 컴포넌트. `selectedMeetingId: string | null` 상태에 따라 회의 카드 아래에 조건부로 마운트된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`의 `meetingAiApi` mock(현재)을 아래처럼 `fetchMeeting`도 포함하도록 확장한다. 기존:

```tsx
vi.mock("../../meetings/libs/utils/meetingAiApi", () => ({
  fetchAttendanceDetail: vi.fn(),
}));
```

변경 후:

```tsx
vi.mock("../../meetings/libs/utils/meetingAiApi", () => ({
  fetchAttendanceDetail: vi.fn(),
  fetchMeeting: vi.fn(),
}));
```

import 블록에 `fetchMeeting` 추가. 기존:

```tsx
import { fetchAttendanceDetail } from "../../meetings/libs/utils/meetingAiApi";
```

변경 후:

```tsx
import { fetchAttendanceDetail, fetchMeeting } from "../../meetings/libs/utils/meetingAiApi";
```

`"fetches and shows attendance detail in meetings mode"` 테스트(현재) 바로 뒤에 아래 테스트들을 추가한다:

```tsx

  it("회의 카드 클릭 시 fetchMeeting을 호출하고 완료된 AI 분석 결과를 표시한다", async () => {
    vi.mocked(fetchAttendanceDetail).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
    ]);
    vi.mocked(fetchMeeting).mockResolvedValue({
      meetingId: "12", projectId: "1", status: "COMPLETED", sourceType: "document",
      fileName: null, analysisSource: "FASTAPI", errorMessage: null, attendees: [],
      analysis: {
        summary: "이번 주 스프린트 진행 상황을 공유했다.",
        decisions: ["API 스펙을 v2로 확정한다"],
        todos: [{ title: "배포 스크립트 작성", description: "", assignee_candidate: "김민준", assignee_id: "1", due_date: null, priority: "HIGH", category: "devops", needs_leader_review: false }],
        risks: ["일정 지연 가능성 있음"],
        keywords: [],
        meeting_meta: { title: "12.10 팀 정기 회의", meeting_date: "2026-12-10", participants: [] },
      },
    });
    const user = userEvent.setup();

    render(
      <MemberDrilldownPanel mode="meetings" memberName="김민준" memberTasks={[]} projectId={1} userId={1} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("12.10 팀 정기 회의")).toBeInTheDocument());
    await user.click(screen.getByText("12.10 팀 정기 회의"));

    await waitFor(() => expect(screen.getByText("이번 주 스프린트 진행 상황을 공유했다.")).toBeInTheDocument());
    expect(fetchMeeting).toHaveBeenCalledWith("1", "12");
    expect(screen.getByText("API 스펙을 v2로 확정한다")).toBeInTheDocument();
    expect(screen.getByText("배포 스크립트 작성")).toBeInTheDocument();
    expect(screen.getByText("일정 지연 가능성 있음")).toBeInTheDocument();
  });

  it("회의 분석이 아직 완료되지 않았으면 상태 안내 문구를 표시한다", async () => {
    vi.mocked(fetchAttendanceDetail).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
    ]);
    vi.mocked(fetchMeeting).mockResolvedValue({
      meetingId: "12", projectId: "1", status: "PROCESSING", sourceType: "document",
      fileName: null, analysisSource: null, errorMessage: null, attendees: [], analysis: null,
    });
    const user = userEvent.setup();

    render(
      <MemberDrilldownPanel mode="meetings" memberName="김민준" memberTasks={[]} projectId={1} userId={1} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("12.10 팀 정기 회의")).toBeInTheDocument());
    await user.click(screen.getByText("12.10 팀 정기 회의"));

    await waitFor(() => expect(screen.getByText("AI 분석이 아직 진행 중입니다.")).toBeInTheDocument());
  });

  it("회의 상세 조회 실패 시 에러 문구를 표시한다", async () => {
    vi.mocked(fetchAttendanceDetail).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
    ]);
    vi.mocked(fetchMeeting).mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();

    render(
      <MemberDrilldownPanel mode="meetings" memberName="김민준" memberTasks={[]} projectId={1} userId={1} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("12.10 팀 정기 회의")).toBeInTheDocument());
    await user.click(screen.getByText("12.10 팀 정기 회의"));

    await waitFor(() => expect(screen.getByText("회의 상세를 불러오지 못했습니다.")).toBeInTheDocument());
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: FAIL — 회의 카드가 아직 클릭 가능한 버튼이 아니고 `MeetingEvidenceDetails`가 없어 `fetchMeeting`이 호출되지 않음.

- [ ] **Step 3: `MeetingEvidenceDetails` 컴포넌트 구현 및 회의 카드를 클릭 가능하게 변경**

import 블록에 `fetchMeeting`과 `MeetingAnalysisResponse` 타입을 추가한다. 기존(Task 6에서 이미 수정된 상태):

```tsx
import { fetchAttendanceDetail, type MeetingAttendanceDetailDto } from "../../meetings/libs/utils/meetingAiApi";
```

변경 후:

```tsx
import {
  fetchAttendanceDetail, fetchMeeting,
  type MeetingAttendanceDetailDto, type MeetingAnalysisResponse,
} from "../../meetings/libs/utils/meetingAiApi";
```

`TaskEvidenceDetails` 컴포넌트 뒤에 `MeetingEvidenceDetails` 컴포넌트를 추가한다:

```tsx
interface MeetingEvidenceDetailsProps {
  projectId: number;
  meetingId: string;
}

const MEETING_STATUS_MESSAGE: Record<string, string> = {
  PROCESSING: "AI 분석이 아직 진행 중입니다.",
  FAILED: "AI 분석에 실패했습니다.",
};

// 심사자용 읽기 전용 회의 근거 — 회의록 AI To-do를 업무로 등록하는 기능은 제공하지 않는다.
function MeetingEvidenceDetails({ projectId, meetingId }: MeetingEvidenceDetailsProps) {
  const [meeting, setMeeting] = useState<MeetingAnalysisResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
    fetchMeeting(String(projectId), meetingId)
      .then((result) => { setMeeting(result); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [projectId, meetingId]);

  if (status === "loading") return <p className="mt-2 ml-3 text-[11px] text-muted-foreground">불러오는 중...</p>;
  if (status === "error") return <p className="mt-2 ml-3 text-[11px] text-red-600">회의 상세를 불러오지 못했습니다.</p>;
  if (!meeting || !meeting.analysis) {
    const message = meeting ? (MEETING_STATUS_MESSAGE[meeting.status] ?? "분석 결과가 없습니다.") : "분석 결과가 없습니다.";
    return <p className="mt-2 ml-3 text-[11px] text-muted-foreground">{message}</p>;
  }

  const { analysis } = meeting;
  return (
    <div className="mt-2 ml-3 pl-3 border-l-2 border-border space-y-3">
      <div>
        <div className="text-[10px] font-bold text-muted-foreground mb-1">AI 요약</div>
        <p className="text-[11px] text-foreground whitespace-pre-wrap">{analysis.summary}</p>
      </div>
      {analysis.decisions.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-muted-foreground mb-1">결정사항</div>
          {analysis.decisions.map((decision, i) => (
            <p key={i} className="text-[11px] text-foreground">· {decision}</p>
          ))}
        </div>
      )}
      {analysis.todos.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-muted-foreground mb-1">To-do 후보</div>
          {analysis.todos.map((todo, i) => (
            <p key={i} className="text-[11px] text-foreground">· {todo.title}</p>
          ))}
        </div>
      )}
      {analysis.risks.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-muted-foreground mb-1">리스크</div>
          {analysis.risks.map((risk, i) => (
            <p key={i} className="text-[11px] text-foreground">· {risk}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

`MemberDrilldownPanel` 본문에 `selectedMeetingId` 상태를 추가한다. 기존(Task 6에서 이미 수정된 상태):

```tsx
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
```

변경 후:

```tsx
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
```

회의 카드 렌더링부를 클릭 가능하게 바꾼다. 기존:

```tsx
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
```

변경 후:

```tsx
                <div className="space-y-2">
                  {attendance.map((meeting) => (
                    <div key={meeting.meetingId}>
                      <button
                        type="button"
                        onClick={() => setSelectedMeetingId((cur) => (cur === meeting.meetingId ? null : meeting.meetingId))}
                        className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted transition-colors"
                      >
                        <div className="min-w-0 text-left">
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
                      </button>
                      {selectedMeetingId === meeting.meetingId && (
                        <MeetingEvidenceDetails projectId={projectId} meetingId={meeting.meetingId} />
                      )}
                    </div>
                  ))}
                </div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: PASS (기존 테스트 + Task 5, 6 테스트 + 이번 Step 1의 신규 3개 테스트 모두 통과)

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/components/MemberDrilldownPanel.tsx App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx
git commit -m "feat: 회의 카드 클릭 시 AI 분석 요약/결정사항/To-do/리스크 읽기 전용 근거 표시"
```

---

### Task 8: Frontend — `WorkloadEvidenceDetails` + `MemberDrilldownPanel`의 `workload` 모드 배선

**Files:**
- Modify: `App/frontend/src/contributors/components/MemberDrilldownPanel.tsx`
- Test: `App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`

**Interfaces:**
- Consumes: `ContributionMemberScoreDto` (Task 4에서 `anomalyType`/`taskCountActiveRel`/`difficultyAvgRel`/`overdueCount` 추가됨), `buildWorkloadEvidenceSentences()` (Task 5).
- Produces: `MemberDrilldownPanelProps.mode`를 `"tasks" | "meetings" | "workload"`로 확장하고 `workloadEvidence?: ContributionMemberScoreDto` prop 추가.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx`의 import 블록에 `ContributionMemberScoreDto` 타입을 추가한다(Task 6에서 이미 `ChecklistItem`을, Task 7에서 `fetchMeeting`/`MeetingAnalysisResponse`를 추가해 둔 상태). 기존:

```tsx
import type { Task } from "../../board/libs/types/task";
```

변경 후:

```tsx
import type { Task } from "../../board/libs/types/task";
import type { ContributionMemberScoreDto } from "../libs/utils/contributorsApi";
```

파일 끝(Task 5에서 추가한 `describe("buildWorkloadEvidenceSentences", ...)` 블록 뒤)에 새 `describe` 블록을 추가한다:

```tsx

describe("MemberDrilldownPanel workload mode", () => {
  function makeEvidence(overrides: Partial<ContributionMemberScoreDto> = {}): ContributionMemberScoreDto {
    return {
      assigneeId: "1", workloadComponent: 17.5, taskComponent: 80.0, meetingComponent: 80.0,
      contributionScore: 60.0, anomalyType: "저활동 의심", taskCountActiveRel: 0.3,
      difficultyAvgRel: 0.9, overdueCount: 0, ...overrides,
    };
  }

  it("mode가 workload이면 신규 fetch 없이 즉시 배지와 근거 문장을 표시한다", () => {
    render(
      <MemberDrilldownPanel
        mode="workload" memberName="김민준" memberTasks={[]} projectId={1} userId={1}
        onClose={() => {}} workloadEvidence={makeEvidence()}
      />
    );

    expect(screen.getByText("저활동 의심")).toBeInTheDocument();
    expect(screen.getByText("진행 중인 업무가 팀 평균 대비 0.3배 적습니다.")).toBeInTheDocument();
    expect(fetchAttendanceDetail).not.toHaveBeenCalled();
  });

  it("anomalyType이 과부하 의심이면 해당 배지를 표시한다", () => {
    render(
      <MemberDrilldownPanel
        mode="workload" memberName="김민준" memberTasks={[]} projectId={1} userId={1}
        onClose={() => {}} workloadEvidence={makeEvidence({ anomalyType: "과부하 의심", taskCountActiveRel: 1.8 })}
      />
    );

    expect(screen.getByText("과부하 의심")).toBeInTheDocument();
  });

  it("workloadEvidence가 없으면 에러 문구를 표시한다", () => {
    render(
      <MemberDrilldownPanel
        mode="workload" memberName="김민준" memberTasks={[]} projectId={1} userId={1}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("편중도 근거를 불러오지 못했습니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: FAIL — `mode="workload"`가 타입 에러(허용되지 않은 값) 및 런타임에서 아무 것도 렌더링하지 않아 텍스트를 찾지 못함.

- [ ] **Step 3: `WorkloadEvidenceDetails` 구현 및 `mode`/`workloadEvidence` 배선**

`MemberDrilldownPanelProps` 인터페이스를 확장한다. 기존:

```tsx
interface MemberDrilldownPanelProps {
  mode: "tasks" | "meetings";
  memberName: string;
  memberTasks: Task[];
  projectId: number;
  userId: number;
  onClose: () => void;
}
```

변경 후:

```tsx
interface MemberDrilldownPanelProps {
  mode: "tasks" | "meetings" | "workload";
  memberName: string;
  memberTasks: Task[];
  projectId: number;
  userId: number;
  onClose: () => void;
  workloadEvidence?: ContributionMemberScoreDto;
}
```

import 블록에 `ContributionMemberScoreDto` 타입을 추가한다. 기존(Task 7에서 이미 수정된 상태):

```tsx
import type { ChecklistItem, Task, TaskStatus } from "../../board/libs/types/task";
```

변경 후:

```tsx
import type { ChecklistItem, Task, TaskStatus } from "../../board/libs/types/task";
import type { ContributionMemberScoreDto } from "../libs/utils/contributorsApi";
```

`MeetingEvidenceDetails` 컴포넌트 뒤에 `WorkloadEvidenceDetails` 컴포넌트를 추가한다:

```tsx
const ANOMALY_BADGE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  "과부하 의심": { label: "과부하 의심", color: "#DC2626", bg: "#FEF2F2" },
  "저활동 의심": { label: "저활동 의심", color: "#D97706", bg: "#FFFBEB" },
};
const DEFAULT_ANOMALY_BADGE = { label: "정상", color: "#64748B", bg: "#F1F5F9" };

interface WorkloadEvidenceDetailsProps {
  workloadEvidence: ContributionMemberScoreDto | undefined;
}

// 신규 fetch 없음 — ContributorsView가 페이지 진입 시 이미 로드해 둔 contributionByMemberId를
// 그대로 prop으로 받아 렌더링한다(업무/회의 모드와 달리 로딩 상태가 없다).
function WorkloadEvidenceDetails({ workloadEvidence }: WorkloadEvidenceDetailsProps) {
  if (!workloadEvidence) {
    return <p className="p-4 text-xs text-muted-foreground">편중도 근거를 불러오지 못했습니다.</p>;
  }

  const badge = ANOMALY_BADGE_STYLE[workloadEvidence.anomalyType] ?? DEFAULT_ANOMALY_BADGE;
  const sentences = buildWorkloadEvidenceSentences({
    anomalyType: workloadEvidence.anomalyType,
    taskCountActiveRel: workloadEvidence.taskCountActiveRel,
    difficultyAvgRel: workloadEvidence.difficultyAvgRel,
    overdueCount: workloadEvidence.overdueCount,
    completionRate: workloadEvidence.taskComponent / 100,
  });

  return (
    <div className="p-4 space-y-3">
      <span
        className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full"
        style={{ color: badge.color, background: badge.bg }}
      >
        {badge.label}
      </span>
      <div className="space-y-1.5">
        {sentences.map((sentence, i) => (
          <p key={i} className="text-xs text-foreground">· {sentence}</p>
        ))}
      </div>
    </div>
  );
}
```

`fetchAttendanceDetail` fetch용 `useEffect`가 `workload` 모드에서 실행되지 않도록 가드 조건을 확인한다(이미 `if (mode !== "meetings") return;`이므로 변경 불필요).

패널 헤더의 타이틀 문구를 확장한다. 기존:

```tsx
          <h3 className="text-sm font-bold text-foreground">
            {memberName} · {mode === "tasks" ? "업무 수행 내역" : "회의 참여 내역"}
          </h3>
```

변경 후:

```tsx
          <h3 className="text-sm font-bold text-foreground">
            {memberName} · {mode === "tasks" ? "업무 수행 내역" : mode === "meetings" ? "회의 참여 내역" : "업무 편중도 근거"}
          </h3>
```

본문 렌더링 분기(`{mode === "tasks" ? ( ... ) : ( ... )}`)를 3-way 분기로 바꾼다. 기존:

```tsx
        {mode === "tasks" ? (
          <div className="p-4 space-y-5">
            {/* ... 업무 그룹 렌더링 ... */}
          </div>
        ) : (
          <div className="p-4">
            {/* ... 회의 참석 렌더링 ... */}
          </div>
        )}
```

변경 후(업무/회의 내부 마크업은 그대로 두고 바깥 조건만 3-way로 확장):

```tsx
        {mode === "tasks" ? (
          <div className="p-4 space-y-5">
            {/* ... 업무 그룹 렌더링(기존과 동일) ... */}
          </div>
        ) : mode === "meetings" ? (
          <div className="p-4">
            {/* ... 회의 참석 렌더링(기존과 동일) ... */}
          </div>
        ) : (
          <WorkloadEvidenceDetails workloadEvidence={workloadEvidence} />
        )}
```

마지막으로 컴포넌트 함수 시그니처에 `workloadEvidence`를 구조분해로 추가한다. 기존:

```tsx
export function MemberDrilldownPanel({ mode, memberName, memberTasks, projectId, userId, onClose }: MemberDrilldownPanelProps) {
```

변경 후:

```tsx
export function MemberDrilldownPanel({ mode, memberName, memberTasks, projectId, userId, onClose, workloadEvidence }: MemberDrilldownPanelProps) {
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run MemberDrilldownPanel.test.tsx`
Expected: PASS (Task 5~7 테스트 + 이번 Step 1의 신규 3개 테스트 모두 통과)

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/components/MemberDrilldownPanel.tsx App/frontend/src/contributors/components/MemberDrilldownPanel.test.tsx
git commit -m "feat: MemberDrilldownPanel에 workload 모드(편중도 근거) 추가"
```

---

### Task 9: Frontend — `ContributorsView.tsx`에서 "업무 편중도" 셀을 클릭 가능하게 배선

**Files:**
- Modify: `App/frontend/src/contributors/screen/ContributorsView.tsx:87,368-370,532-541`
- Test: `App/frontend/src/contributors/screen/ContributorsView.test.tsx`

**Interfaces:**
- Consumes: `MemberDrilldownPanel`의 확장된 `mode`/`workloadEvidence` prop (Task 8), `contributionByMemberId`(이미 존재하는 `ContributorsView` 상태).
- Produces: `drilldown` 상태의 `mode` 타입 확장, "업무 편중도" 셀 클릭 시 `mode: "workload"`로 패널 오픈.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/screen/ContributorsView.test.tsx`의 `beforeEach` 블록(현재 라인 47-56) 안 `fetchContributionScore` mock을 아래처럼 바꿔 편중도 근거가 포함된 멤버 데이터를 반환하도록 한다. 기존:

```tsx
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
```

변경 후:

```tsx
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchContributionScore).mockResolvedValue({
      members: [
        {
          assigneeId: "1", workloadComponent: 17.5, taskComponent: 80.0, meetingComponent: 80.0,
          contributionScore: 60.0, anomalyType: "저활동 의심", taskCountActiveRel: 0.3,
          difficultyAvgRel: 0.9, overdueCount: 0,
        },
      ],
      note: null,
    });
    vi.mocked(fetchAttendanceSummary).mockResolvedValue([]);
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask("A", "1", "done", "AI 모델 학습 파이프라인 구축"),
      makeTask("B", "1", "inprogress", "데이터 전처리 스크립트 작성"),
      makeTask("C", "2", "done", "다른 팀원의 업무"),
    ]);
  });
```

같은 파일의 마지막 테스트(`"opens the meeting drilldown panel..."`, 현재 라인 75-89) 뒤에 새 테스트를 추가한다:

```tsx

  it("opens the workload drilldown panel without a new fetch when '업무 편중도' cell is clicked", async () => {
    renderView();
    const user = userEvent.setup();

    await waitFor(() => expect(fetchContributionScore).toHaveBeenCalled());
    const nameCell = screen.getByText("김민준", { selector: ".text-sm" });
    const row = nameCell.closest('[role="button"]') as HTMLElement;
    const workloadCell = within(row).getByText("17.5");
    await user.click(workloadCell);

    await waitFor(() => expect(screen.getByText("저활동 의심")).toBeInTheDocument());
    expect(fetchContributionScore).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd App/frontend && pnpm test -- --run ContributorsView.test.tsx`
Expected: FAIL — "업무 편중도" 셀이 아직 `<div>`라서 클릭해도 아무 일도 일어나지 않아 "저활동 의심" 텍스트를 찾지 못함.

- [ ] **Step 3: `drilldown` 상태 타입 확장 및 셀을 버튼으로 변경**

`drilldown` 상태 선언(현재 라인 87)을 아래처럼 바꾼다. 기존:

```tsx
  const [drilldown, setDrilldown] = useState<{ mode: "tasks" | "meetings"; memberId: string } | null>(null);
```

변경 후:

```tsx
  const [drilldown, setDrilldown] = useState<{ mode: "tasks" | "meetings" | "workload"; memberId: string } | null>(null);
```

"업무 편중도" 셀(현재 라인 368-370)을 아래처럼 바꾼다. 기존:

```tsx
                      <div className="text-xs text-foreground text-center">
                        <span className="font-bold">{report.categories.workload}</span>
                      </div>
```

변경 후:

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

`MemberDrilldownPanel` 렌더링부(현재 라인 532-541)에 `workloadEvidence` prop을 추가한다. 기존:

```tsx
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
```

변경 후:

```tsx
      {drilldown && currentProjectId != null && (
        <MemberDrilldownPanel
          mode={drilldown.mode}
          memberName={mergedReports.find((report) => report.memberId === drilldown.memberId)?.name ?? ""}
          memberTasks={projectTasks.filter((task) => task.assignee === drilldown.memberId)}
          projectId={currentProjectId}
          userId={Number(drilldown.memberId)}
          onClose={() => setDrilldown(null)}
          workloadEvidence={contributionByMemberId[drilldown.memberId]}
        />
      )}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run ContributorsView.test.tsx`
Expected: PASS (기존 2개 + 신규 1개 테스트 모두 통과)

- [ ] **Step 5: 전체 프론트엔드 테스트 스위트 통과 확인**

Run: `cd App/frontend && pnpm test -- --run`
Expected: PASS (회귀 없음 — 모든 기존 테스트 + 이번 플랜에서 추가한 테스트 전부 통과)

- [ ] **Step 6: 커밋**

```bash
git add App/frontend/src/contributors/screen/ContributorsView.tsx App/frontend/src/contributors/screen/ContributorsView.test.tsx
git commit -m "feat: 업무 편중도 셀 클릭 시 편중도 근거 드릴다운 패널 표시"
```

---

## 최종 확인 (전체 플랜 완료 후)

- [ ] FastAPI 전체 테스트: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests -q`
- [ ] Spring 전체 테스트: `cd App/backend_spring && ./gradlew test`
- [ ] 프론트엔드 전체 테스트: `cd App/frontend && pnpm test -- --run`
- [ ] `git log --oneline -10`으로 9개 커밋(Task 1~9)이 순서대로 쌓였는지 확인
- [ ] **push는 하지 않는다** — 사용자가 명시적으로 요청할 때만 push
