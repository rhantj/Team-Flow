# RAG 개인화 기능 잔여 한계 해소 — 설계

## 배경

`feature/ai_assistent` 브랜치에 구현된 RAG 개인화(담당 업무 기반 질의응답) 기능에는
여러 라운드의 리뷰를 거치며 대부분의 지적 사항이 반영됐다. 그중 실제로 남아 있는
두 가지 한계를 이번 작업에서 해소한다.

- 개인 의도 판별(`_is_personal_intent`)이 정규식/토큰 목록 기반이라 일부 활용형·압축형
  표현을 놓친다.
- 담당자 동기화(`RagIngestService.syncAssigneeBestEffort`)가 비동기 best-effort라,
  FastAPI 호출이 실패하면 예외를 로그만 남기고 삼켜서 복구 경로가 없다.

(참고로 "담당 청크가 없을 때 프로젝트 전체로 폴백해 다른 사람 업무가 섞인다"는 세 번째
지적은 코드 확인 결과 `retrieval_service.py`에 이미 반영되어 있어 — `assignee_id`가
지정되면 결과가 비어 있어도 폴백하지 않음 — 이번 범위에서 제외한다.)

## 검토한 접근 방식과 선택 이유

| 항목 | 대안 | 선택 | 이유 |
|---|---|---|---|
| 의도 판별 개선 | 정규식/토큰 확장 vs 형태소 분석기(KoNLPy/Mecab) 도입 | **정규식/토큰 확장** | 외부 런타임 의존성(mecab-ko) 없이 빠르게 반복 가능. 기존 패턴(정확 토큰 매칭 + 압축형 lookahead)과 일관되고, 지금까지 오탐 방지 이력이 좋았음 |
| 동기화 실패 복구 | Spring 자체 재시도(`@Retryable`) vs Kafka 아웃박스 패턴 | **Spring 자체 재시도** | Kafka 인프라는 이미 있지만, 이 정도 신뢰성 요구 수준에 컨슈머/재처리 로직을 새로 구축하는 건 과도함(YAGNI). 기존 스택 안에서 해결 |
| 재시도 전량 실패 후 처리 | 실패 기록만 vs 관리자 재실행 엔드포인트 포함 | **실패 기록만** | 현재 규모에서 담당자 동기화 실패 빈도가 낮을 것으로 판단. 재실행 경로는 필요해지면 그때 추가 |

## 설계

### A. 개인 의도 판별 확장

**파일:** `App/backend_fastapi/llm_rag_assistant/app/services/chat_service.py`,
`App/backend_fastapi/tests/llm_rag_assistant/test_chat_service.py`

- `_COMPACT_PERSONAL_TASK_PATTERN`의 lookahead 명사 목록 확장:
  기존 `업무|담당|할\s?일|일감|태스크|꺼|것` → `일|건|리스트|목록|todo|task` 추가.
- "내가할일줘"처럼 조사가 명사 앞에 공백 없이 붙는 압축형을 잡기 위해,
  `내`/`제` 뒤에 단일 조사(`가|는|이`)를 선택적으로 허용하도록 패턴 확장.
- "내가 맡은 거"류 표현 커버를 위해 lookahead에 `맡` 추가.
- 순수 로직 변경이며 DB·인프라 영향 없음.

**테스트:** 신규 긍정 케이스 3~4개(예: "내가할일줘", "제가 맡은 거 뭐야", "todo 알려줘")와
기존 오탐 방지 회귀 세트("내년", "내용", "제안", "제출")를 함께 검증.

### B. 담당자 동기화 재시도

**데이터 흐름:**
`syncAssigneeBestEffort` 호출 → FastAPI 요청 실패 시 1s → 2s → 4s 간격으로 최대 3회
재시도 → 모두 실패하면 `@Recover` 메서드가 `rag_assignee_sync_failures` 테이블에
1건 기록 → 예외는 계속 삼켜서 호출 스레드(회의록/업무 저장 흐름)에는 영향 없음.

**컴포넌트:**
- `App/backend_spring/build.gradle`: `spring-retry`, `spring-boot-starter-aop` 의존성 추가
  (`@Retryable` 프록시에 AOP 필요)
- `App/backend_spring/src/main/java/com/workflowai/common/RetryConfig.java` (신규):
  `@EnableRetry`
- `App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailure.java`
  (신규 JPA 엔티티): `id`, `projectId`, `sourceType`, `sourceId`, `assigneeId`,
  `errorMessage`, `failedAt`
- `App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailureRepository.java`
  (신규): `JpaRepository<RagAssigneeSyncFailure, Long>`
- `App/backend_spring/src/main/java/com/workflowai/rag/RagIngestService.java` 수정:
  `syncAssigneeBestEffort`에 `@Retryable(retryFor = Exception.class, maxAttempts = 3,
  backoff = @Backoff(delay = 1000, multiplier = 2))` 적용, `@Recover` 메서드가
  실패 기록을 저장
- `docs/db/migrations/009_rag_assignee_sync_failures.sql` (신규): 실패 기록 테이블.
  기존 관례대로 코드는 이번에 커밋하되, 실제 Supabase 적용은 별도로 사용자 확인 후 진행

**에러 처리:** 재시도 중 발생하는 예외는 spring-retry 프레임워크가 처리하고,
최종 실패만 `@Recover`에서 DB에 기록한다. 기존과 동일하게 최상위에서 예외를
삼켜 회의록/업무 저장 흐름을 절대 막지 않는다.

**테스트:** `RagIngestServiceTest` (신규) — Mockito로 `FastApiRagClient.syncAssignee`가
지정된 횟수만큼 예외를 던지도록 설정한 뒤, (1) 재시도 횟수가 설정대로 호출되는지,
(2) 전량 실패 시 `RagAssigneeSyncFailureRepository.save`가 정확히 1회 호출되는지 검증.

## 범위에서 제외한 것

- 담당 청크 없을 시 폴백 문제 — 이미 해결됨 (위 배경 참고)
- 형태소 분석기 기반 완전한 자연어 이해 — 이번 정규식 확장으로도 커버 안 되는
  극단적 활용형은 향후 필요성이 커질 때 별도 작업으로
- 관리자 재실행(replay) 엔드포인트 — 실패 빈도가 실제로 문제가 될 때 추가

## 구현 결과 (2026-07-22)

- Task 1: `_COMPACT_PERSONAL_TASK_PATTERN`에 조사 결합형(`가|는|이`)과 `맡|건|리스트|목록|todo|task` 추가로 완료
- Task 2~4: `spring-retry` 기반 재시도(최대 3회, 지수 백오프) + `rag_assignee_sync_failures` 실패 기록 테이블로 완료
- 마이그레이션 009는 코드 커밋만 완료 — 실제 Supabase 적용은 사용자 확인 후 별도 진행 예정
