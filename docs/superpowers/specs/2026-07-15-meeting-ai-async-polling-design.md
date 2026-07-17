# 회의록 AI 비동기 분석 + 상태 폴링 설계

- 날짜: 2026-07-15
- 브랜치: `feature/meetings_ai`
- 범위: 회의록 업로드 → 백그라운드 분석 → 상태 폴링 → 실패/재시도. LLM 품질 개선, 업무보드 DB 완전 연동, Railway/DB 연결 로직은 범위 밖.

## 배경 / 문제

`POST /api/v1/projects/{projectId}/meetings/analyze`는 요청 스레드에서 FastAPI 호출(또는 Spring fallback)까지 동기로 끝내고 `completed` 상태로 저장한 뒤 응답한다. 프론트 `MeetingsView.tsx`는 실제 서버 상태를 조회하지 않고 70ms 간격의 가짜 progress로 "분석 중" 화면을 흉내낸 뒤 응답이 오면 바로 결과 화면으로 전환한다. 분석에 실패해도 재시도 수단이 없다.

## 아키텍처

### 백엔드: 비동기 분리 (self-invocation 회피)

Spring AOP 프록시 특성상 같은 빈 내부에서 `this.asyncMethod()`를 호출하면 `@Async`/`@Transactional`이 적용되지 않는다. 이를 피하기 위해 책임을 두 빈으로 나눈다.

- **`MeetingAnalysisService`** (기존 빈, 축소)
  - `analyze(...)`: 동기. 텍스트 추출 → `Meeting` 저장(`analysis_status=processing`) → 업로드 파일 저장 → 참석자 저장 → `MeetingAnalysisRunner.runAnalysis(meetingId, request)` 호출 → 즉시 응답(`status=PROCESSING`, `analysis=null`) 반환.
  - `saveAnalysisSuccess(meetingId, result, analysisSource)` — `@Transactional`. `MeetingAnalysis` 저장 + `MeetingActionItem` 목록 저장 + `Meeting.analysisStatus=completed`.
  - `saveAnalysisFailure(meetingId, errorMessage)` — `@Transactional`. `Meeting.analysisStatus=failed` + `analysisErrorMessage` 저장.
  - `retry(meetingId)`: `failed` 상태인지 검증 → 저장된 파일에서 텍스트 재추출 → `Meeting` 필드 + `MeetingAttendee`로 `AiAnalyzeRequest` 재구성 → 상태 `processing`으로 전환, `analysisErrorMessage` 초기화 → `MeetingAnalysisRunner.runAnalysis` 재호출.
  - `find(meetingId)`: 상태별 분기. `completed`면 기존처럼 전체 결과 조립, `processing`/`failed`면 `analysis=null` + 해당 상태(`failed`면 `errorMessage` 포함)로 응답.

- **`MeetingAnalysisRunner`** (신규 `@Component`, 별도 빈)
  - `@Async("meetingAnalysisExecutor") public void runAnalysis(Long meetingId, AiAnalyzeRequest request)`
  - FastAPI 호출 → 실패/null이면 Spring fallback. 두 경로 모두 실패(예외)하면 `meetingAnalysisService.saveAnalysisFailure(...)` 호출.
  - 분석 결과를 얻으면 `meetingAnalysisService.saveAnalysisSuccess(...)` 호출. 이 저장 자체가 실패해도 예외를 잡아 `saveAnalysisFailure`로 폴백.

- **Executor 설정**: `@EnableAsync` + `ThreadPoolTaskExecutor` 빈(`meetingAnalysisExecutor`, corePoolSize=2, maxPoolSize=4, queueCapacity=50)을 새 `@Configuration` 클래스로 추가.

### 데이터/스키마

- `meetings.analysis_error_message TEXT NULL` 컬럼 추가. 마이그레이션 파일 `src/main/resources/db/init/03_meeting_ai_async_status.sql`을 `02_meeting_ai_additions.sql`과 동일한 스타일(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)로 신규 작성.
  - `ddl-auto: validate`이므로 이 스키마 변경은 실제 DB(로컬/Railway)에 별도로 수동 적용해야 함 — 이번 작업에서는 마이그레이션 SQL 파일만 추가하고, DB 연결/Railway 설정 자체는 변경하지 않는다.
- `Meeting` 엔티티에 `analysisErrorMessage` 필드 + getter/setter 추가.

### 운영 배포 전 DB 체크

- 운영/Railway 환경은 `ddl-auto=validate` 기준이므로 배포 전에 `App/backend_spring/src/main/resources/db/init/03_meeting_ai_async_status.sql`을 실제 DB에 먼저 적용해야 한다.
- `analysis_error_message` 컬럼이 없는 상태로 새 애플리케이션을 기동하면 Hibernate validate 단계에서 서버 시작이 실패할 수 있다.
- 이 작업은 스키마 자동 변경(`ddl-auto=update`)으로 해결하지 않고, 기존 `db/init` SQL 적용 순서에 맞춰 수동 검증한다.

### API

| 메서드 | 경로 | 변경 내용 |
|---|---|---|
| POST | `/analyze` | 즉시 `meetingId` + `status=PROCESSING` 반환, 분석은 백그라운드 |
| GET | `/{meetingId}` | `processing`/`failed` 상태에서도 200 응답(분석 결과 없이 상태만) |
| GET | `/{meetingId}/status` | 신규. 경량 상태 조회: `{meetingId, status, errorMessage}` |
| POST | `/{meetingId}/retry` | 신규. `failed`일 때만 허용, 재분석 트리거 |

`MeetingAnalysisResponse.analysis`는 nullable로 변경하고 `errorMessage` 필드를 추가한다.

### 프론트엔드

- 기존 가짜 progress 애니메이션(70ms 간격 useEffect)은 유지하되 **90%에서 정지**하도록 상한을 바꾸고, 100% 도달 시 자동으로 `uploadFlow`를 전환하던 로직은 제거한다.
- 실제 화면 전환은 새 폴링 `useEffect`가 담당: `analyzeMeeting` 응답으로 받은 `meetingId`를 대상으로 1.5~3초 간격 `setInterval`로 `fetchMeeting`을 호출. `COMPLETED`면 결과 상태 반영 후 `uploadFlow="results"`, `FAILED`면 `analysisError` 설정 후 동일 화면(기존 실패 렌더링 분기)으로 전환. interval은 `useRef`로 보관하고 완료/실패/unmount 시 정리.
- 실패 화면(기존 `renderResults()`의 `!analysisResult` 분기)에 "다시 분석" 버튼 추가 → `retryMeetingAnalysis` 호출 → 성공 시 폴링 재시작.
- `meetingAiApi.ts`: `analyzeMeeting`/`fetchMeeting`/`retryMeetingAnalysis` 함수와 응답 타입(`status`, `analysis: MeetingAiResult | null`, `errorMessage: string | null`)을 통일.

## 트랜잭션/동시성

- 초기 저장(파일/참석자/`Meeting`)은 각 리포지토리 호출 단위로 이미 원자적이므로 `analyze()` 전체를 감싸는 큰 트랜잭션은 두지 않는다 (있으면 커밋 전에 비동기 스레드가 실행되어 레이스가 생길 수 있음).
- 성공/실패 저장은 각각 `MeetingAnalysisService`의 별도 `@Transactional` 메서드로, 다른 빈(`MeetingAnalysisRunner`)에서 호출되므로 프록시가 정상 적용된다.
- `retry`는 `failed` 상태가 아니면 거부(409/400으로 컨트롤러에서 매핑)해 중복 실행을 막는다.

## 테스트

- 백엔드: `meeting` 패키지에 테스트가 전무했으므로 Mockito 기반 단위 테스트 신규 작성.
  - `MeetingAnalysisServiceTest`: `analyze()`가 `processing`으로 저장 후 즉시 반환하는지, `saveAnalysisSuccess`/`saveAnalysisFailure` 상태 전이, `retry()`가 `failed`가 아닐 때 거부하는지.
  - `MeetingAnalysisRunnerTest`: FastAPI 실패 → fallback 성공 경로, 둘 다 실패 시 `saveAnalysisFailure` 호출 검증.
- 프론트: 기존에 이 화면에 대한 테스트가 없어 이번 작업에서는 `pnpm build` 타입체크만 최소 검증으로 진행(사용자 승인됨).
- 최소 검증 명령: `./gradlew test`, `pnpm build`.

## 범위 밖 (명시적 제외)

- 실제 LLM 분석 품질/프롬프트 개선
- 업무보드 DB 완전 연동
- Railway 배포 설정, `DatabaseUrlPropertyMapper`, Docker 설정 변경
