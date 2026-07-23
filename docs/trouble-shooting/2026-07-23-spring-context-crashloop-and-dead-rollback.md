# Spring 컨텍스트 기동 실패로 인한 운영 전면 장애, 그리고 동작한 적 없는 롤백

- 날짜: 2026-07-23
- 범위: `App/backend_spring`, `.github/workflows/deploy-oci.yml`
- 영향: 운영 API 전면 중단 (약 10:11~10:29 UTC, 18분)
- 관련 실행: Actions run `29998308916` (실패), `29999257943` (복구)

## 증상

`https://t3-workflow-ai.site/api/v1/health/ready`가 502를 반환했다. liveness인
`/api/v1/health`도 함께 502였다. 프론트 정적 페이지(`/`)만 200으로 응답해, 겉보기에는
사이트가 살아 있는 것처럼 보였다.

```text
workflow-backend-spring   Up 11 seconds   restarts=9
```

컨테이너가 12초 주기로 재기동을 반복했다. `restart: unless-stopped` 정책 때문에 죽은
채로 멈추지 않고 계속 살아나려다 실패하는 상태였다. Redis·DB·Kafka·FastAPI는 모두
정상이었고 큐 적체도 없었다(`XLEN meeting-analysis` = 0).

## 원인 1 — 생성자 주입 모호성으로 컨텍스트 초기화 실패

```text
UnsatisfiedDependencyException: Error creating bean with name 'healthController'
  ... Unsatisfied dependency expressed through constructor parameter 1:
  Error creating bean with name 'meetingAnalysisQueueWorker':
  Failed to instantiate: No default constructor found
Caused by: java.lang.NoSuchMethodException:
  com.workflowai.meeting.MeetingAnalysisQueueWorker.<init>()
```

`MeetingAnalysisQueueWorker`에 테스트용 생성자 오버로드 3개가 추가되면서 생성자가 총
4개가 됐는데, 어느 것에도 `@Autowired`가 없었다.

Spring의 생성자 선택 규칙은 다음과 같다.

1. 생성자가 **하나뿐이면** 그것을 주입에 사용한다.
2. 여러 개면 `@Autowired`가 붙은 것을 사용한다.
3. `@Autowired`가 없으면 **기본 생성자로 폴백**한다.
4. 기본 생성자마저 없으면 `NoSuchMethodException`으로 실패한다.

생성자가 하나였을 때는 1번 규칙으로 동작했다. 오버로드가 늘어난 순간 2번으로 넘어갔고,
표시가 없어 3번을 시도했으며, 인자 없는 생성자가 없어 4번에서 죽었다.

`HealthController`가 이 빈에 의존하므로 **헬스 엔드포인트까지 함께 죽었다.** 그래서
liveness와 readiness가 동시에 502가 됐다.

### 왜 테스트가 못 잡았나

이 버그는 코드 로직에 없다. `MeetingAnalysisQueueWorker`의 로직도, 생성자 4개도 전부
정상 동작한다. 깨진 것은 "Spring이 이 클래스를 어떻게 생성해야 하는가"라는 메타 정보다.

당시 백엔드 테스트는 45개였고, 그중 **`@SpringBootTest`가 하나도 없었다.** 전부
협력 객체를 손으로 조립하는 순수 단위 테스트다.

```java
new MeetingAnalysisQueueWorker(redis, mapper, repo, runner, delay);  // 통과
```

단위 테스트는 생성자를 **직접 호출**하므로 Spring의 생성자 **선택** 과정을 전혀 타지
않는다. 선택 과정이 고장 나도 초록불이 뜬다. 이 부류를 배선(wiring) 버그라고 부르며,
같은 부류로 빈 이름 충돌(`@Qualifier` 누락), 순환 참조, prod 프로파일에만 없는
`@Value` 프로퍼티, `private` 메서드에 붙어 무시되는 `@Transactional` 등이 있다. 전부
컨테이너를 실제로 띄워야만 드러난다.

커버리지 지표로도 보이지 않는다. 커버리지는 "코드가 실행됐나"를 재지 "앱이 뜨나"를
재지 않는다.

## 원인 2 — 롤백 스텝이 도입 이후 한 번도 실행된 적이 없음

배포 실패는 감지됐다. `deploy` 스텝의 내부 readiness 폴링이 30회 재시도 후 정상적으로
실패했다.

```text
OCI internal readiness failed
##[error]Process completed with exit code 1.
```

조건이 충족되어 롤백 스텝도 트리거됐다. 그런데 이렇게 죽었다.

```text
/home/runner/work/_temp/....sh: line 41: syntax error near unexpected token `('
##[error]Process completed with exit code 2.
```

**exit code 2는 셸 문법 오류다.** 스크립트에 있는 어떤 `exit 1` 가드에도 걸리지
않았다는 뜻이다. 즉 롤백은 "안전 조건 미충족으로 차단"된 것이 아니라, **SSH 접속을
시도하기도 전에 러너에서 파싱 단계에 죽었다.**

원인은 인용부호 중첩이다. 원격 명령 전체가 작은따옴표로 ssh에 넘어간다.

```yaml
ssh ... '
  ...
  rag_outbox_count=$(printf '%s\n' "$outbox_query_result" \
    | grep -Ec '^(delete:|delete_project|sync:|ingest:)') || rag_outbox_count=0
  ...
'
```

안쪽 `printf '%s\n'`의 첫 작은따옴표가 **바깥 인용을 닫아버린다.** 그 뒤로 인용
상태가 뒤집혀 `^(delete:|...)`가 따옴표 없이 노출되고, bash가 `(`를 문법 오류로 본다.

같은 파일의 preflight 스텝은 이 문제를 알고 `'"'"'` 이스케이프를 쓰고 있다
(`to_regclass('"'"'public.rag_assignee_sync_failures'"'"')`). 롤백 스텝만 이 규칙을
따르지 않았다.

로컬 재현:

```bash
$ bash -n rollback.sh
rollback.sh: line 41: syntax error near unexpected token `('
```

CI 로그의 행 번호와 정확히 일치한다.

### 원인 2-b — 잠복 결함: Go 템플릿 변수가 원격 셸에 먹힘

문법 오류를 고쳐도 롤백은 여전히 동작하지 않았을 것이다.

```bash
spring_network=$(docker inspect workflow-backend-spring \
  --format "{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}" \
  | sed -n "1p")
```

`$name`과 `$_`는 Go 템플릿 변수지만 **큰따옴표 안에 있어 원격 bash가 먼저 치환한다.**
`$name`은 빈 문자열로, `$_`는 bash 특수 변수(직전 명령의 마지막 인자)로 바뀐다.

서버에서 실측한 결과:

```text
현재 코드 그대로 : [template parsing error: template: :1: unexpected "," in range]
이스케이프 적용  : [app_default]
```

`spring_network`가 비면 이어지는 outbox 조회가 `docker run --network ""`로 실패하고,
`rag_outbox_count`가 `unavailable`로 남아 다음 가드에 걸린다.

```text
Automatic rollback blocked: queue/outbox metrics unavailable
```

즉 **큐가 깨끗해도 항상 차단된다.** `oci-server.md`는 이 차단을 "설계상 fail-closed"로
설명하고 있었지만, 실제로는 템플릿 버그로 인한 오탐이었다. 결과적으로 안전한 쪽으로
실패하긴 했으나 의도된 동작은 아니다.

`| sed -n "1p"` 파이프라인이라 `pipefail`이 없어 종료 코드가 `sed`의 0이 되고,
`set -e`에도 걸리지 않아 조용히 넘어간 점이 발견을 늦췄다.

## 해결

### 1. 생성자 주입 확정

```diff
+import org.springframework.beans.factory.annotation.Autowired;
 import org.springframework.boot.ApplicationArguments;
@@
+    // 테스트용 오버로드가 있어 생성자가 여러 개다. 표시가 없으면 Spring이 기본 생성자를 찾다 기동에 실패한다.
+    @Autowired
     public MeetingAnalysisQueueWorker(
```

### 2. 컨텍스트 로드 테스트 신설

`App/backend_spring/src/test/java/com/workflowai/ApplicationContextLoadTest.java`

`@SpringBootTest` + Testcontainers(Postgres `pgvector/pgvector:pg17`, Redis)로 실제
컨텍스트를 띄운다. 테스트 메서드 본문은 비어 있다. 검증 대상이 메서드 안의 코드가
아니라 "컨텍스트 기동에 성공했는가"이기 때문이다.

H2로 대체할 수 없다. 엔티티와 스키마가 Postgres 전용 타입에 의존한다. Docker가 없는
환경에서는 `@Testcontainers(disabledWithoutDocker = true)`로 실패 대신 건너뛴다.

주의: `ddl-auto`는 `create-drop`이 아니라 `create`다. 컨테이너가 Spring 컨텍스트보다
먼저 종료되므로 종료 시 drop DDL이 커넥션을 얻지 못해 30초를 대기하다 실패한다.

### 3. 배선 규칙 검사 테스트 신설

`App/backend_spring/src/test/java/com/workflowai/BeanConstructorWiringTest.java`

클래스패스를 스캔해 생성자가 여러 개인 모든 컴포넌트가 Spring의 선택 규칙을 만족하는지
검증한다. 외부 인프라가 필요 없어 1초 미만으로 끝난다. 2번의 대체재가 아니라 보완재다.
2번이 넓게 잡고 3번이 빠르게 잡는다.

### 4. 롤백 스크립트 인용/이스케이프 수정

```diff
-              rag_outbox_count=$(printf '%s\n' "$outbox_query_result" \
-                | grep -Ec '^(delete:|delete_project|sync:|ingest:)') || rag_outbox_count=0
+              rag_outbox_count=$(printf "%s\n" "$outbox_query_result" \
+                | grep -Ec "^(delete:|delete_project|sync:|ingest:)") || rag_outbox_count=0
```

```diff
 spring_network=$(docker inspect workflow-backend-spring \
-  --format "{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}" \
+  --format "{{range \$name, \$_ := .NetworkSettings.Networks}}{{println \$name}}{{end}}" \
   | sed -n "1p")
```

### 5. actionlint CI 게이트 신설

`.github/workflows/lint-workflows.yml`

배포 워크플로의 실패 경로(롤백 등)는 정상 배포에서 실행되지 않으므로 문법 오류가 있어도
드러나지 않는다. actionlint는 `run` 블록을 shellcheck로 검사해 이를 잡는다.

## 확인

**생성자 수정 (RED → GREEN)**

수정을 되돌린 상태에서 신규 테스트 2개 모두 실패:

```text
BeanConstructorWiringTest > 모든 컴포넌트는 ... FAILED
BeanConstructorWiringTest > MeetingAnalysisQueueWorker는 ... FAILED
2 tests completed, 2 failed
```

**컨텍스트 테스트가 운영 장애를 재현하는지**

`@Autowired`를 주석 처리하고 실행:

```text
ApplicationContextLoadTest > 애플리케이션 컨텍스트가 기동된다 FAILED
    Caused by: org.springframework.beans.factory.UnsatisfiedDependencyException
        Caused by: java.lang.NoSuchMethodException
```

운영 로그와 동일한 예외 체인이다. 수정 복원 후 전체 스위트 `BUILD SUCCESSFUL`.

**actionlint가 롤백 버그를 잡는지**

인용 수정만 되돌리고 실행:

```text
SC1036:error:45:20: '(' is invalid here. Did you forget to escape it?
SC1088:error:45:20: Parsing stopped here. Invalid use of parentheses?
```

수정 복원 후 전체 워크플로 통과.

**운영 복구**

```text
ready:200
live:200
restarts=0 running=true
```

## 남은 과제

- `RAG_INTERNAL_API_KEY`, `LANGSMITH_API_KEY` 로테이션 (과거 채팅 기록에 평문 노출).
  `oci-server.md`에 기록된 미결 사항이며 이번 작업에서도 처리하지 않았다.
- 마이그레이션 009/010(`meetings.analysis_job_id`, `rag_assignee_sync_failures`)에
  해당하는 SQL 파일이 레포에 없다. `db/migration`에는 `V20260721_1` 하나뿐인데
  readiness와 배포 preflight는 두 객체의 존재를 검사한다. Supabase에 수동 적용된
  것으로 보이며, 신규 환경 구축 시 재현이 불가능하다.
- 롤백 경로는 이번 수정 이후에도 **실제로 트리거된 적이 없다.** 다음 배포 실패 전에
  스테이징에서 강제 실패를 유도해 end-to-end 검증이 필요하다.
- Docker 빌드 캐시 9.6GB (회수 가능 4.9GB). 디스크는 46%로 여유가 있어 시급하지 않다.

## 관련 문서

- [oci-server.md](../../document_고무서/oci-server.md) — 서버 운영 노트 (커밋 금지)
- [2026-07-23-redis-queue-oci.md](2026-07-23-redis-queue-oci.md)
