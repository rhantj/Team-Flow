# 기여도 리포트 파이프라인 설계

- 날짜: 2026-07-20
- 작성자: 고무서 (Claude Code)
- 관련 기능: 심사자 기여도 분석 (`contributors`)

## 배경

FS-1(심사자 RBAC) 이후 이어지는 "심사자/기여도" 개발 순서 중 다음 단계:

```
심사자 RBAC 검증(FS-1 연동) → 업무/회의/문서 활동 집계 →
/ai/report/contribution 에서 LLM으로 기여도 요약 → contribution_reports 저장 →
심사자 전용 화면(팀원 외 접근 차단)
```

코드 조사 결과 심사자 RBAC(`ProjectAccess`, `RequireRole`)와 심사자 전용 화면(`ContributorsView.tsx`, 라우트 가드)은 이미 구현되어 있으나, 집계 → LLM 요약 → `/ai/report/contribution` 엔드포인트 → `contribution_reports` 저장으로 이어지는 파이프라인은 구현되어 있지 않다. `contribution_reports` 테이블은 스키마만 존재(`01_base_schema.sql:311-322`)하고 Entity/Repository/Controller가 없으며, 화면은 `global/lib/mock/reviewer.ts`의 하드코딩 데이터를 사용 중이다.

이 문서는 그 빠진 파이프라인의 설계를 다룬다.

## 목표

- 심사자가 화면에서 "리포트 새로고침"을 누르면, 업무(tasks) + 회의(meetings) + 워크로드 스코어(FS-5) 활동을 집계하고 LLM으로 팀원별 기여도 요약을 생성해 `contribution_reports`에 저장하고 화면에 표시한다.

## 비목표 (향후 작업)

- `evaluation_scores`(최종 점수 확정/공개 토글) 연동 — 별도 기존 관심사로, 이번 파이프라인은 손대지 않는다.
- `github_records`, 산출물(deliverables) 데이터를 evidence에 포함하는 것.
- 배치/스케줄 기반 자동 생성 (프로젝트 생성/마감 시 자동 트리거).

## 워크로드 스코어(FS-5) 연동

FS-5(업무 편중 점수) 담당 팀원이 `/ai/score/workload`를 실시간 계산에서 **`workload_scores` 테이블에 저장하는 방식으로 전환**하기로 했다 (변경은 FS-5 담당자가 진행). 이 파이프라인은 그 저장된 값을 읽어 evidence에 포함한다.

**제안 스키마** (FS-5 담당자와 확정 필요 — 실제 스키마가 다르면 아래 `load_workload_scores` 쿼리만 맞춰 수정):

```sql
CREATE TABLE workload_scores (
    id             BIGSERIAL PRIMARY KEY,
    project_id     BIGINT NOT NULL,
    user_id        BIGINT NOT NULL,
    overload_score DECIMAL(5,2) NOT NULL,
    anomaly_type   VARCHAR(20) NOT NULL,
    computed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_workload_scores_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_workload_scores_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);
COMMENT ON TABLE workload_scores IS 'FS-5 업무 편중 점수 스냅샷 (재계산마다 새 row, contribution_reports와 동일한 이력 저장 방식)';
COMMENT ON COLUMN workload_scores.anomaly_type IS '정상/과부하 의심/저활동 의심/이상 패턴(방향 불명확) 중 하나';
```

**evidence 반영 방식:** evidence는 문자열 배열 형태를 그대로 유지한다. 워크로드 스코어가 있는 유저는 세 번째 줄로 한 줄 추가한다 (예: `"업무 편중 점수 82.5점 (과부하 의심)"`). `anomaly_type`은 FS-5가 이미 4가지 고정값(정상/과부하 의심/저활동 의심/이상 패턴)으로 내려주므로 그대로 문구에 사용한다. `workload_scores`에 해당 유저 데이터가 아직 없으면(FS-5 전환 전, 또는 배정 업무 없음) 이 줄을 생략한다 — 에러 아님.

**절대 비교 금지:** `overload_score`는 프로젝트(팀) 내 상대 점수이므로, evidence 문구나 LLM 프롬프트에 다른 프로젝트와 비교하는 표현을 넣지 않는다.

**스냅샷 정책:** 이 설계는 이미 리포트를 요청할 때마다 `contribution_reports`에 새 row를 INSERT하는 방식(생성 시점 스냅샷)이므로, "스냅샷 고정 + 심사자가 원할 때 리포트 새로고침 버튼으로 재계산" 요구사항을 추가 변경 없이 그대로 만족한다.

## 아키텍처 & 데이터 흐름

기존 RAG 파이프라인(`RagController` → `FastApiRagClient` → FastAPI `/ai/rag/query`)과 동일한 3단 구조를 재사용한다.

```
ContributorsView.tsx ("리포트 새로고침" 버튼 클릭, 온디맨드)
  → apiFetch("/api/v1/ai/contribution/report", {project_id})
  → Spring: ContributionReportController
      @PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")
      → FastApiContributionClient.generate(request)   (RestClient, RagController와 동일 패턴)
  → FastAPI: POST /ai/report/contribution
      1) tasks 테이블에서 project_id 기준 팀원별 업무 완료율 집계
         (ml_workload_score/app/services/workload_db.py의 load_tasks_from_db 재사용)
      2) 회의 출석 데이터에서 팀원별 참석 횟수·참석률 집계
         (meetingAiApi / FastApiMeetingClient가 다루는 기존 attendance 집계 로직 재사용)
      3) 집계 결과를 팀원별로 묶어 Ollama 프롬프트에 삽입, 2~3문장 한국어 요약 생성
         (llm_rag_assistant/app/services/chat_service.py와 동일하게 로컬 Ollama 사용)
      4) evidence는 LLM이 아니라 집계 단계에서 코드로 조립
         (예: ["To-Do #3,#6 완료", "회의 3/4회 참석"]) — LLM 환각으로 근거가 틀리는 것 방지
      5) contribution_reports에 SQLAlchemy로 직접 INSERT
         (project_id, user_id, summary, evidence JSONB) — workload_db.py의 DB 직접 연결 패턴 재사용
      6) 생성된 리포트 목록을 JSON으로 응답
  → Spring이 FastAPI 응답을 ApiResponse<List<MemberContribution>>로 감싸 반환
  → 프론트가 CONTRIB_REPORTS mock 대신 실 데이터를 렌더링
```

RBAC은 Spring 진입점에서 `ProjectAccess.hasRole(projectId, REVIEWER)`로 검증한다. FastAPI는 이미 Spring이 검증한 project_id만 전달받으므로, `chat_router.py`의 TODO 주석이 우려하는 "요청의 project_id를 그대로 신뢰하는" 문제 자체가 발생하지 않는다.

## API 계약

### FastAPI: `POST /ai/report/contribution`

```python
class ContributionReportRequest(BaseModel):
    project_id: int

class MemberContribution(BaseModel):
    user_id: int
    name: str
    summary: str
    evidence: list[str]

class ContributionReportResponse(BaseModel):
    success: bool
    data: list[MemberContribution]
```

### Spring: `POST /api/v1/ai/contribution/report`

- `@PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")`
- Body: `{project_id: number}` → FastAPI로 그대로 전달
- 응답을 `ApiResponse<List<MemberContribution>>`로 감싸 반환
- RAG의 `RagRateLimiter`를 재사용해 프로젝트 단위 rate limit 적용 (여러 팀원을 한 번에 요약하므로 LLM 호출 비용/시간이 큼)

## DB 쓰기 정책

`contribution_reports`에 UNIQUE 제약이 없으므로, 리포트를 새로고침할 때마다 `(project_id, user_id)` 조합으로 새 row를 INSERT해 이력을 쌓는다. 화면은 각 유저별 가장 최근 row만 조회해 표시한다.

## 에러 처리

- FastAPI: Ollama 연결 실패/타임아웃 시 `503` + `{"error": "llm_unavailable"}` (`chat_router.py`와 동일 패턴)
- Spring: FastAPI 호출 실패 시 `503` + `ApiResponse.fail("CONTRIBUTION_REPORT_UNAVAILABLE", "기여도 리포트를 생성하지 못했습니다.")` (`RagController`와 동일 패턴)
- 집계 대상 팀원이 0명이면 빈 배열을 반환한다 (에러 아님)

## 프론트 연동

- `App/frontend/src/contributors` 하위에 `contributorsApi.ts` 신규 생성 (`ragApi.ts` 패턴: snake_case 응답 → camelCase 변환)
- `ContributorsView.tsx`의 `global/lib/mock/reviewer.ts` `CONTRIB_REPORTS` 사용을 실 API 호출로 대체
- "리포트 새로고침" 버튼 `onClick`에 연결 → 로딩 상태 표시 → 응답으로 로컬 state 갱신
- 최초 진입 시 자동 호출하지 않는다 (버튼 클릭 시에만 — 온디맨드 트리거 결정과 일치, 불필요한 LLM 비용 방지)
- `score`/`isPublic` 필드는 이번 스코프의 `contribution_reports`에 없다 (비목표의 `evaluation_scores` 소관). 화면에서 해당 컬럼을 어떻게 유지/비활성 표시할지는 구현 계획(writing-plans) 단계에서 결정한다.

## 테스트

- FastAPI: `contribution_service.py` 단위 테스트 (집계 로직, evidence 조립은 LLM 호출과 분리되어 결정적으로 테스트 가능), 라우터 테스트 (`workload_router` 테스트 패턴 참고)
- Spring: `ContributionReportController` MockMvc 테스트 — 성공/503/rate limit 429 검증
- Spring 보안: `ContributionReportSecurityTest` — `@PreAuthorize("@projectAccess.hasRole(..., 'REVIEWER')")`가 false일 때 HTTP 403 + `FORBIDDEN` envelope를 반환하는지 검증한다.
- Spring 역할 판정: `ProjectAccessTest` — REVIEWER는 허용되고 MEMBER는 `hasRole(projectId, "REVIEWER") == false`인 것을 검증한다.

## 구현 확인 (2026-07-20)

- FastAPI `POST /ai/report/contribution` 구현 및 `app.main` 라우터 등록 완료.
- Spring `POST /api/v1/ai/contribution/report` 구현 완료: REVIEWER `@PreAuthorize`, `RagRateLimiter`, FastAPI 프록시, 503/429 표준 응답.
- Frontend `contributorsApi.ts`와 `ContributorsView.tsx` 버튼 연동 완료. 최초 진입 자동 호출 없이 버튼 클릭 시에만 요약/근거를 갱신한다.
- Docker 이미지에 `ai_contribution_report` 패키지 복사 추가 완료.
- 검증: FastAPI contribution tests 11 passed, Spring contribution/security tests BUILD SUCCESSFUL, Frontend contributors API test 1 passed, Docker Compose 기동 및 Spring 경유 API 200 OK 확인.
