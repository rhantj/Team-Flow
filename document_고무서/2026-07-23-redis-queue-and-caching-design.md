# Redis Queue(회의록 AI) + 캐싱(회의록 AI, AI 어시스턴트) 설계

날짜: 2026-07-23

## 배경

- `App/docker-compose.yml`에 `redis:7-alpine` 서비스와 `REDIS_URL`/`REDIS_HOST` 환경변수가
  이미 정의돼 있지만 실제 코드에서는 어디서도 쓰이지 않는 상태였다 (`2026-07-21-redis-caching-candidates.md`).
- WF-264 "Redis Queue 작업 처리 구조 구현"(원래 박지수 담당, 상위 에픽 WF-200 공통 통합/인프라)를
  고무서가 이관받아 실행하기로 함.
- WF-264가 가리키는 대상은 **회의록 AI 분석**이며, 구체적인 목표 구조는
  `WorkFlow_AI_회의록_Redis_Queue_구조.md`에 별도 정리되어 있다. 이 문서는 그 구조 문서를
  실제 구현 결정사항으로 확정하고, 캐싱 후보 문서의 항목 중 이번에 함께 처리할 범위를
  최종 정리한다.
- 캐싱은 `2026-07-21-redis-caching-candidates.md`에서 검토한 4개 후보(기여도 리포트 요약,
  워크로드 대시보드, Spring 대시보드 집계, RAG 임베딩/검색) 중 이번 라운드에는 **회의록 AI**와
  **AI 어시스턴트(RAG 챗봇)** 두 곳에만 한정한다. 기여도 리포트/워크로드/대시보드 캐싱은 이번
  범위에서 제외.

## 현재 구조 (변경 전)

```text
회의록 업로드
→ Spring이 파일 저장 + 텍스트 추출(extractText, 요청 스레드에서 동기 실행)
→ meetings row 저장 (analysis_status = "processing")
→ Spring 내부 @Async("meetingAnalysisExecutor") (인메모리 ThreadPoolTaskExecutor,
   corePoolSize=2, maxPoolSize=4, queueCapacity=50) 로 MeetingAnalysisRunner 실행
→ FastAPI /api/v1/meetings/analyze-json 동기 호출 (HF → Ollama → 규칙 기반 폴백 순)
→ 분석 결과 DB 저장 + Notification 생성
→ Frontend가 GET .../status 폴링으로 결과 확인
```

한계 (기존 구조 문서에서 정리됨): 서버 재시작 시 진행 중 작업 유실, 동시 업로드 시 스레드 부담,
대기열 가시성 없음, 재시도/타임아웃 관리 어려움, 인스턴스 확장 시 중복 실행 위험.

## A. WF-264 — 회의록 AI 분석 Redis Queue

### 범위

Queue 등록과 Spring 내부 Worker 전환을 구현한다. 사전 검토에서 확인된 정상 종료·재시작 시 작업
유실과 Redis 장애 시 `PROCESSING` 고착은 이번 변경에서 함께 방지한다. 자동 재시도 횟수 정책,
dead-letter queue, 신규 DB 컬럼, 별도 Worker 서비스는 여전히 범위 밖이다.

### 확정된 설계 결정

1. **Redis 클라이언트**: `spring-boot-starter-data-redis`와 Spring Boot 자동 구성
   `StringRedisTemplate`을 사용한다. 연결 정보는 `spring.data.redis.*` 환경변수로 주입한다.
2. **큐 구현 방식**: Redis Stream + Consumer Group을 사용한다. List `BRPOP`은 처리 전에 메시지를
   제거해 프로세스 종료 시 작업이 영구 손실되므로 채택하지 않는다. Worker는 ACK 전 pending
   메시지를 재시작 시 먼저 읽고, `MeetingAnalysisRunner`가 반환한 뒤에만 ACK와 XDEL을 수행한다.
3. **큐 이름**: Stream key는 `meeting-analysis`, group은 `meeting-analysis-workers`, consumer는
   `meeting-analysis-worker`로 고정한다. retry/dead-letter/priority용 별도 키는 만들지 않는다.
4. **Worker 구현 위치**: Spring 내부 Worker (구조 문서의 "1. Spring 내부 Worker" 옵션 — 현재
   구조와 가장 유사하고 DB 저장 로직 재사용이 쉬워 초기 구현 비용이 낮음). FastAPI Worker나 별도
   Worker 서비스는 장기 옵션으로 남겨두되 이번엔 채택하지 않음.
5. **텍스트 추출 시점**: **변경하지 않는다.** `MeetingAnalysisService.analyze()`에서 지금처럼
   요청 스레드가 `extractText(file)`를 동기 실행하고, 추출된 텍스트를 job payload에 포함해
   큐에 넣는다. 구조 문서는 "원문을 Redis에 넣지 말고 파일 참조만" 넣을 것을 권장하지만, 그러려면
   텍스트 추출 로직 자체를 Worker로 옮겨야 해서 이번 라운드 변경 범위를 벗어난다고 판단 —
   변경 최소화를 우선했다. (다음 라운드에서 재검토 가능)
6. **Job payload**: UUID `jobId`, `meetingId`, `AiAnalyzeRequest`의 기존 필드(title,
   meetingDate, meetingKind, sourceType, fileName, text, participantNames)를 JSON 직렬화해
   Stream record의 `payload` 필드에 저장한다. 원문은 Redis에 남지만 로그에는 payload를 출력하지
   않고 record id와 meeting id만 기록한다.
7. **상태값**: `Meeting.analysisStatus` 필드를 그대로 유지 (`"processing"` / `"completed"` /
   `"failed"`). 구조 문서가 제안하는 `uploaded`/`queued` 세분화된 상태값, 그리고
   `analysis_error_message`/`analysis_started_at`/`analysis_completed_at`/
   `analysis_retry_count`/`analysis_job_id` 컬럼 추가는 4단계(retry/모니터링) 범위이므로
   이번엔 도입하지 않는다. REST 응답의 `"PROCESSING"` 문자열도 그대로 유지 — 프론트 변경 없음.
8. **중복 실행 방지**: 기존과 동일하게 retry 엔드포인트는 `analysisStatus == "failed"`인
   회의만 허용한다. `processing`/`completed` 상태에서는 새 job을 등록하지 않는다.
9. **enqueue 실패 처리**: DB 커밋 후 Stream 등록이 실패하면
   `MeetingAnalysisPersistence.saveAnalysisFailure()`를 호출해 별도 트랜잭션에서 상태를
   `failed`로 바꾼다. 사용자 수동 retry 경로를 유지한다. DB와 Redis의 완전한 원자성을 위한
   transactional outbox는 신규 DB 스키마가 필요하므로 이번 범위에서 제외한다.
10. **장애 제어**: Redis 읽기 오류에는 최대 5초의 지수 backoff를 적용해 busy loop와 로그 폭주를
    막는다. 종료 시 Worker interrupt 후 제한 시간 동안 join한다. Spring→FastAPI HTTP 호출에는
    connect 5초/read 45초 timeout을 적용하고, 컨테이너 `stop_grace_period`는 60초로 둔다.
11. **멱등 처리**: pending 메시지를 다시 받았을 때 해당 회의 상태가 이미 `completed` 또는
    `failed`이면 Runner를 재호출하지 않고 ACK/XDEL한다. `saveAnalysisSuccess()`가 하나의 DB
    트랜잭션이므로 DB 커밋 후 ACK 전 종료 시에도 액션 아이템·RAG ingest·알림 중복을 막는다.
12. **준비 상태**: Spring readiness는 Redis PING, consumer group 생성 완료, Worker thread 생존을
    함께 확인한다. OCI 배포 workflow는 Spring readiness, FastAPI health, Redis PING을 모두
    통과해야 성공으로 판정한다.

### 처리 흐름 (변경 후)

```text
회의록 업로드
→ Spring이 파일 저장 + 텍스트 추출 (기존과 동일, 요청 스레드)
→ meetings row 저장 (analysis_status = "processing", 기존과 동일)
→ Spring이 Redis Stream(meeting-analysis)에 job XADD
→ meetingId 즉시 반환 (기존과 동일)

MeetingAnalysisQueueWorker (신규, 백그라운드 스레드 1개)
→ consumer group의 pending 메시지를 먼저 복구한 뒤 XREADGROUP으로 신규 메시지 소비
→ 기존 MeetingAnalysisRunner 로직 그대로 실행:
   FastAPI 분석 호출 → 실패 시 Spring 폴백 분석기 → DB 저장 → Notification 생성
→ 실행 반환 후 XACK + XDEL
→ analysis_status = "completed" 또는 "failed"

Frontend → GET .../status 폴링 (기존과 동일, 변경 없음)
```

### 제거 대상

- `MeetingAnalysisAsyncConfig.java` (`meetingAnalysisExecutor` 빈) — 큐+Worker로 대체되며
  더 이상 필요 없어짐.
- `MeetingAnalysisRunner.runAnalysis()`의 `@Async("meetingAnalysisExecutor")` 애노테이션 —
  이미 Worker의 백그라운드 스레드에서 호출되므로 추가 비동기 디스패치 불필요.

## B. 캐싱 1 — 회의록 재분석 LLM 결과 캐시 (FastAPI)

- **목적**: 같은 회의록을 retry로 재분석 요청할 때, 원문이 바뀌지 않았다면 LLM을 다시 호출하지
  않고 캐시된 결과를 재사용.
- **위치**: FastAPI `analyze-json` 엔드포인트, LLM 호출 직전 (`analyze_meeting_with_huggingface`/
  `analyze_meeting_with_ollama` 진입 전).
- **캐시 키**: `project_id`, `title`, `meeting_date`, 원문, 정렬된 참석자, meeting kind,
  source type, provider/model, cache schema version 등 결과를 결정하는 입력 전체의 SHA256 해시.
- **캐시 값**: 분석 결과 JSON (summary, decisions, todos, risks, keywords 등 `MeetingAnalysisResult`
  전체).
- **TTL**: 24시간.
- **클라이언트**: 파이썬 `redis` 8.0.1(`redis.asyncio` 포함)을 루트 `requirements.txt`에 추가.
- **장애 처리**: client 생성·조회·역직렬화·저장 실패는 warning 로그 후 cache miss로 처리한다.
  손상된 캐시 값은 삭제하고 다시 계산한다. 규칙 기반 폴백 결과도 24시간 캐시한다.

## C. 캐싱 2 — AI 어시스턴트(RAG 챗봇) 완전일치 질문 캐시 (FastAPI)

- **목적**: 완전히 동일한 질문이 짧은 시간 내 반복될 때 임베딩+검색+생성 파이프라인 전체를
  다시 태우지 않음.
- **위치**: `llm_rag_assistant/app/services/chat_service.py`의 `answer_question()`, `embed_text`
  호출 직전.
- **캐시 키**: `rag_answer:{project_id}:{assignee_id 또는 "none"}:{질문 원문 정규화 후 SHA256 해시}`
  — 질문이 한 글자라도 다르면 miss (유사도 기반 캐싱은 하지 않음, 구현 단순성 우선).
- **캐시 값**: `RagQueryResponse` 직렬화(JSON) — `answer` + `sources`.
- **TTL**: 30분.
- **장애/일관성**: client 생성·조회·역직렬화·저장 실패는 warning 로그 후 cache miss로
  처리한다. 프로젝트 데이터 변경에 대한 즉시 invalidation은 하지 않고 최대 30분 stale을
  허용한다.

## 공통 인프라

- 두 서비스(Spring, FastAPI) 모두 `App/docker-compose.yml`의 기존 `redis` 서비스를 그대로
  재사용한다. 새 인프라 추가 없음.
- Redis는 `redis-data:/data` named volume과 AOF(`appendonly yes`, `appendfsync everysec`)를
  사용하고 `maxmemory-policy noeviction`으로 Stream 메시지가 캐시 압력 때문에 축출되지 않게 한다.
- 운영에서는 Redis host port를 게시하지 않는다. 기본 사용자를 끄고 `spring`, `fastapi`, `admin`
  ACL 사용자를 분리한다. 비밀번호는 `REDIS_SPRING_PASSWORD`, `REDIS_FASTAPI_PASSWORD`,
  `REDIS_ADMIN_PASSWORD` 환경변수로만 주입하며 저장소에 기본값을 두지 않는다.
- Spring 사용자는 `meeting-analysis*` Stream key와 Stream 명령만, FastAPI 사용자는
  `meeting_analysis:*`/`rag_answer:*` cache key와 GET/SET/DEL만 접근하도록 제한한다. payload
  원문은 어떤 오류 로그에도 출력하지 않는다.
- WF-264(큐)와 캐싱은 같은 Redis 인스턴스를 공유하지만 서로 기능적으로 독립적이다 — 큐는
  Spring에서만, 캐시 1/2는 FastAPI에서만 사용.

## 이번 범위에서 제외되는 것 (명시적 보류)

- 회의록 분석 자동 retry 횟수/timeout/dead-letter queue 정책
- transactional outbox와 Redis TLS(단일 호스트 내부 Docker network이므로 이번 범위에서는 ACL 적용)
- `analysis_error_message`/`analysis_started_at`/`analysis_completed_at`/
  `analysis_retry_count`/`analysis_job_id` DB 컬럼 추가
- 기여도 리포트 LLM 요약 캐싱, 워크로드 대시보드 캐싱, Spring 대시보드 집계 캐싱
  (`2026-07-21-redis-caching-candidates.md`의 후보 1~3)
- Worker 수평 확장, 별도 Worker 서비스 분리
