# FS-09 업무별 기여도 인사이트(Task Insight) 설계

## Context

심사자 화면(`ContributorsView.tsx`)의 "AI 분석 요약" 카드는 현재 팀원별 점수(숫자)만 보여준다. 심사자가 점수만 보고 판단하지 않고, **어떤 업무를 완료했는지 / 그중 편중도(업무 난이도·우선순위 기반)가 높았던 업무는 무엇인지**를 근거로 확인할 수 있도록 LLM 기반 업무별 분석을 추가한다.

기존에 이미 심사자용 LLM 요약 기능(`ai_contribution_report`, Ollama 기반 2~3문장 요약)이 존재하지만, 이는 **고무서(FS-4)님이 만든 모듈**이다. 이번 기능은 고무서님 모듈을 수정하지 않고, 이은주(FS-5)님이 소유한 `contribution_score` 모듈 안에 완전히 별도로 추가한다. LLM은 Claude API가 아니라 **기존 Ollama 설정(`core.config.get_settings()`의 `ollama_host`/`generation_model`, 기본값 `gemma4:e2b`)을 재사용**한다 — 새 API 키/비용 없이, 앱 전역 설정이라 소유권 문제도 없다.

## Goals

- 팀원별로 "완료한 업무 제목 목록"과 "편중도(난이도) 기여가 높았던 업무 목록"을 계산해 노출한다.
- 위 데이터를 근거로 Ollama가 한국어 요약 문장을 생성한다 (기존 `ai_contribution_report` evidence→LLM 요약 패턴과 동일한 구조: **목록/근거는 코드가 계산하고, LLM은 자연어 요약만 담당** — Ollama는 구조화 출력을 신뢰할 수 없으므로 목록 자체를 LLM 출력에 의존하지 않는다).
- 기존 "AI 분석 요약" 카드에 요약 문장 + 완료 업무 목록 + 편중도 높은 업무 목록을 함께 표시한다.
- 프로젝트 팀원 전체를 배치로 한 번에 생성한다 (기존 "리포트 새로고침"과 동일한 온디맨드 배치 UX).

## Non-goals

- `ai_contribution_report`(고무서 소유) 수정 — 하지 않는다.
- Claude API 연동 — 이번엔 하지 않는다 (Ollama 재사용으로 결정됨).
- `contribution_reports` 테이블에 이 인사이트를 영구 저장 — 이번 스코프에서는 온디맨드 계산만 하고 별도 저장하지 않는다 (기존 numeric score와 동일하게 매 요청 시 재계산).

## Architecture

```
tasks 테이블 (title, category, priority, status, assignee_id)
        │
        ▼
contribution_score/app/services/task_insight_db.py  (신규)
  - load_tasks_with_title(project_id) → assignee_id별 업무 목록(title, category, priority, is_done)
        │
        ▼
contribution_score/app/services/task_insight_service.py  (신규)
  - difficulty_of() 재사용 (ml_workload_score.app.services.workload_model)
  - 팀원별: 완료 업무 제목 목록 / 난이도 상위 N개 업무 목록 계산
  - Ollama(gemma4:e2b) 호출 → 위 목록을 근거로 한국어 요약 문장 생성
        │
        ▼
contribution_score/app/routers/task_insight_router.py  (신규)
  POST /ai/score/contribution/insight?project_id={id}
        │
        ▼
Spring: FastApiContributionInsightClient → ContributionInsightController
  POST /api/v1/ai/contribution/insight
        │
        ▼
Frontend: fetchContributionInsight(projectId) → ContributorsView "AI 분석 요약" 카드
```

## API 계약

### FastAPI: `POST /ai/score/contribution/insight?project_id={id}`

응답 (기존 `contribution_score` 엔드포인트와 동일한 envelope 패턴):

```json
{
  "success": true,
  "data": {
    "project_id": 1,
    "members": [
      {
        "assignee_id": "1",
        "summary": "김민준 팀원은 이번 스프린트에서 AI 모델 학습 파이프라인 구축 등 5개 업무를 완료했습니다. 그중 'AI 모델 하이퍼파라미터 튜닝' 업무가 난이도가 높아 편중도에 가장 크게 기여했습니다.",
        "completed_tasks": ["AI 모델 학습 파이프라인 구축", "데이터 전처리 스크립트 작성", "..."],
        "high_workload_tasks": ["AI 모델 하이퍼파라미터 튜닝", "임베딩 기반 난이도 보정 로직"]
      }
    ],
    "note": null
  }
}
```

- `completed_tasks`: `status`가 완료인 업무의 `title` 목록 (코드로 직접 계산, LLM 미개입).
- `high_workload_tasks`: 해당 팀원의 업무 중 `difficulty_of(priority, category)` 값 기준 **상위 2개**(완료 여부 무관 — 진행 중인 고난이도 업무도 편중도에 기여하므로 포함) 업무의 `title` 목록. 동률 처리는 `task_id` 오름차순.
- `summary`: 위 두 목록 + 기존 workload/task/meeting 컴포넌트 점수를 근거로 Ollama가 생성한 2~3문장 한국어 요약. 근거에 없는 내용 추측 금지 프롬프트 사용 (기존 `_SUMMARY_SYSTEM_PROMPT`와 동일한 원칙, 단 별도 상수로 이 모듈 안에 정의).
- 업무가 아예 없는 팀원: `completed_tasks: []`, `high_workload_tasks: []`, summary는 "배정된 업무가 없습니다" 계열의 코드 생성 문장(이 경우 Ollama 호출 생략 — 빈 데이터로 LLM 호출하는 건 낭비이자 근거 없는 문장 생성 위험).

### Spring: `POST /api/v1/ai/contribution/insight`

- 기존 `ContributionScoreController`와 동일한 패턴: `@PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")`, `RagRateLimiter` 재사용, `ApiResponse<ContributionInsightResponseDto>` 래핑.
- 신규 파일: `ContributionInsightRequest`, `ContributionMemberInsightDto`(`assigneeId, summary, completedTasks: List<String>, highWorkloadTasks: List<String>`), `ContributionInsightResponseDto`, `ContributionInsightEnvelope`, `FastApiContributionInsightClient`, `ContributionInsightController`.
- 읽기 타임아웃: Ollama 생성 호출이 있으므로 `ai_contribution_report`의 `FastApiContributionClient`와 동일하게 60초로 설정 (숫자 score용 30초보다 길게).

### Frontend

- `contributorsApi.ts`에 `fetchContributionInsight(projectId)` 추가, `ContributionMemberInsightDto` 타입 추가.
- `ContributorsView.tsx`: 새 상태 `contributionInsights` — "AI 분석 요약" 카드 리프레시 버튼(기존 "리포트 새로고침"과 별개로 신규 버튼, 라벨은 구현 단계에서 결정) 클릭 시 `fetchContributionInsight(currentProjectId)` 호출해 프로젝트 팀원 전체 배치 생성 후 `assigneeId` 키로 저장.
- 카드 렌더링: 기존 `aiSummary` 아래에 "완료한 업무" bullet 목록, "편중도가 높았던 업무" bullet 목록을 조건부로 추가 표시 (데이터 없으면 기존 카드 그대로 — 하위호환).

## 에러 처리

- Ollama 연결 실패(`httpx.ConnectError`, `httpx.TimeoutException`, `ollama.ResponseError`): FastAPI 503, 코드 `CONTRIBUTION_INSIGHT_LLM_UNAVAILABLE` — 기존 `ai_contribution_report` 라우터와 동일한 캐치 패턴.
- 그 외 예외: 500, 코드 `CONTRIBUTION_INSIGHT_FAILED`.
- Spring: 예외 시 503 + `ApiResponse.fail("CONTRIBUTION_INSIGHT_UNAVAILABLE", ...)` — 기존 `ContributionScoreController`와 동일.
- 프론트: 호출 실패 시 조용히 실패 처리(기존 `fetchContributionScore`/`fetchAttendanceSummary`와 동일한 catch-to-empty 패턴), 카드에는 업무 목록 섹션만 안 보이고 기존 요약은 그대로 유지.

## 테스트 계획

- FastAPI: `task_insight_db.py`(쿼리 매핑), `task_insight_service.py`(난이도 상위 N 추출 로직 — 동률/빈 목록/전부 미완료 케이스), 라우터(성공/Ollama 실패 503/빈 프로젝트).
- Spring: 컨트롤러 테스트(REVIEWER 권한, rate limit, 성공/실패 응답 매핑) — 기존 `ContributionScoreControllerTest` 패턴 따름.
- Frontend: `contributorsApi.test.ts`에 `fetchContributionInsight` 케이스 추가. `ContributorsView` 카드 렌더링은 기존 테스트 스위트 내 스냅샷/조건부 렌더 확인.

## 알려진 한계

- `high_workload_tasks`는 팀 내 상대 비교가 아니라 **개인 내 업무 간 상대 비교**(그 사람의 업무 중 난이도가 높은 것)다. 팀 전체에서 상대적으로 편중도가 높은지는 기존 `workload_component`(overload_score 기반) 점수가 담당하므로, 카드에는 "이 사람의 업무 중"이라는 문구를 명시해 혼동을 막는다.
- 담당자 미배정 업무는 집계에서 제외된다 (기존 workload score와 동일한 한계).
- Ollama(`gemma4:e2b`)는 로컬 소형 모델이라 요약 품질이 Claude 대비 낮을 수 있음 — 추후 필요 시 Claude API로 교체 가능하도록 서비스 함수 인터페이스(`generate_insight_summary(member_name, completed, high_workload, scores) -> str`)를 LLM 구현과 분리해 둔다.
