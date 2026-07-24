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

## 원인 3 — 백엔드 테스트를 실행하는 CI가 존재하지 않음

원인 1·2보다 상위에 있는 구조적 원인이다. 장애 시점의 워크플로는 `deploy-oci.yml`
하나뿐이었고, **`main` push가 빌드·테스트를 전혀 거치지 않고 곧바로 운영 배포로
이어졌다.**

```console
$ grep -ln "gradlew" .github/workflows/*.yml
없음
```

테스트 45개가 레포에 있었지만 CI에서 아무도 실행하지 않았다. 원인 1의 컨텍스트 기동
실패는 `@SpringBootTest`가 하나만 있었어도 잡혔겠지만, 설령 있었더라도 **실행되지
않았을 것이다.** 테스트를 추가하는 것만으로는 방어선이 되지 않는다.

## 원인 4 — 롤백 대상 태그가 고장난 커밋을 가리킴

장애 복구 직후 서버 상태를 확인한 결과:

```text
deploy-previous : 5871984  Merge pull request #244   ← 크래시 루프를 일으킨 커밋
HEAD            : 7a3654d  Merge pull request #245   ← 수정본
```

`deploy` 스텝은 배포 시작 시점에 `git tag -f deploy-previous HEAD`를 찍는다. 즉
`deploy-previous`는 **"직전에 배포된 것"이지 "마지막으로 정상 동작한 것"이 아니다.**
실패한 배포가 서버 HEAD를 고장난 커밋으로 옮겨놓으면, 그 다음 배포가 찍는
`deploy-previous`는 고장난 커밋을 가리킨다.

이 상태에서 배포 실패가 나면 롤백이 크래시 루프 버전으로 되돌린다. `Verify rollback
health` 스텝이 이를 감지해 수동 개입을 요구하겠지만, 그때는 이미 두 번 잘못 배포된
뒤다.

## 해결

이 문서는 장애 전체를 다루므로, 아래 조치는 **여러 커밋에 나뉘어 반영됐다.** 어느
변경이 어디에 들어갔는지 먼저 밝힌다. 이 문서가 포함된 커밋의 diff만 보면 1·3번이
없어 보이지만, 그 둘은 이미 머지되어 운영에 반영된 상태다.

| 항목 | 반영 위치 | 상태 |
|---|---|---|
| 1. `@Autowired` 생성자 확정 | `007c201` (PR #245 → main) | 머지·배포 완료 |
| 3. `BeanConstructorWiringTest` | `007c201` (PR #245 → main) | 머지·배포 완료 |
| 2. `ApplicationContextLoadTest` | `fb0a36a` | 이 브랜치 |
| 4. 롤백 인용·템플릿 수정 | `fb0a36a` | 이 브랜치 |
| 5. actionlint 게이트 | `fb0a36a` | 이 브랜치 |
| 6. 테스트 CI·배포 게이트 | `af4d9f9` 이후 | 이 브랜치 |
| 7. `deploy-last-good` 롤백 지점 | `af4d9f9` 이후 | 이 브랜치 |

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

### 6. 테스트 CI 신설 및 배포 게이트 연결

`.github/workflows/backend-tests.yml` — PR과 `dev`/`main` push에서 백엔드 테스트를
실행한다. 머지 전에 잡는 층이다.

`deploy-oci.yml`에 `test` 잡을 추가하고 `deploy` 잡이 `needs: test`로 의존하게 했다.
컨텍스트가 뜨지 않는 코드는 서버에 도달할 수 없다.

두 곳 모두 `ApplicationContextLoadTest`가 **실제로 실행됐는지** 결과 XML로 확인한다.
Docker가 없으면 조용히 건너뛰는 테스트라, 게이트에서 건너뛰면 방어선이 사라진다.

```bash
if ! grep -q 'tests="1" skipped="0"' "$report"; then
  echo "ApplicationContextLoadTest가 실행되지 않았거나 건너뛰어졌습니다."
  exit 1
fi
```

### 7. 롤백 대상을 "마지막 정상본"으로 변경

헬스체크를 통과한 시점에만 `deploy-last-good` 태그를 찍는 스텝을 추가하고, 롤백은 이
태그**만** 사용한다.

`deploy-previous`로 폴백하지 않는다. 폴백하면 원인 4의 위험이 그대로 남기 때문이다 —
`deploy-previous`는 정상 동작이 확인된 적이 없는 커밋이고, 실제로 장애 직후 크래시
루프 커밋을 가리키고 있었다. 태그가 없으면 자동 롤백을 차단하고 수동 개입을 요구한다.
**자동 롤백이 없는 것보다 고장난 버전으로 되돌리는 쪽이 더 위험하다.**

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

**건너뜀 감지 가드** (`ci/verify-context-test-ran.py`)

처음에는 `grep 'tests="1" skipped="0"'` 문자열 매칭으로 만들었으나, 속성 순서나 리포트
형식이 바뀌면 조용히 무력화된다. XML 파싱 방식으로 교체하고 7가지 입력으로 확인했다.

| 입력 | 결과 |
|---|---|
| 정상 실행 | PASS |
| 건너뜀 (속성 순서를 뒤바꾼 XML) | FAIL — 건너뜀 감지 |
| 실행된 테스트 0개 | FAIL |
| 테스트 실패 | FAIL |
| `skipped` 속성 누락 (형식 변화) | FAIL — 형식 변화 감지 |
| 파싱 불가 | FAIL |
| 리포트 파일 없음 | FAIL |

`skipped` 속성과 `<skipped>` 요소 개수를 교차 확인해, 한쪽만 바뀌는 형식 변화도 막는다.

**롤백 판정부 실측 (서버, 읽기 전용)**

수정본의 판정 로직만 서버에서 실행했다. `docker stop`, `git reset --hard`,
`compose up`은 제외했다.

```text
spring_network=[app_default]
Rollback safety metrics: queue_length=0, queue_pending=0, rag_outbox=0
판정: PROCEED
```

수정 전에는 `spring_network`가 비어 outbox 조회가 실패하고 `rag_outbox=unavailable`로
차단됐다. 판정이 BLOCKED에서 PROCEED로 뒤집혔다.

**롤백 대상 선택 로직 실측 (서버, 읽기 전용)**

서버에 `deploy-last-good`이 아직 없으므로 현재는 자동 롤백이 차단된다. 이것이 의도된
동작이다 — 폴백 대상인 `deploy-previous`가 크래시 루프 커밋(5871984)을 가리키고 있어,
폴백했다면 고장난 버전으로 되돌렸을 것이다.

```text
deploy-previous : 5871984  Merge pull request #244   ← 크래시 루프 커밋
deploy-last-good: (없음)
→ 판정: BLOCKED, 수동 개입 요구
```

**운영 복구**

```text
ready:200
live:200
restarts=0 running=true
```

## 남은 과제

- **운영 문서에 자격 증명을 쓰지 않는다 (재발 방지).** 이 문서를 처음 작성할 때 서버
  접속 정보가 평문 예시 명령으로 들어간 채 커밋된 적이 있다. 해당 커밋은 이력에서
  제거했고 브랜치 전체를 재검색해 남아 있지 않음을 확인했다.

  원인은 보호 범위의 착각이었다. `document_고무서/oci-server.md`만
  `.git/info/exclude`로 막혀 있고 **`docs/trouble-shooting/`은 추적 대상이다.**
  운영 문서에는 접속 정보를 넣지 말고 `oci-server.md` 참조로 대체한다. 서버 명령
  예시는 접속 부분을 빼고 원격에서 실행할 명령만 적는다.
- `RAG_INTERNAL_API_KEY`, `LANGSMITH_API_KEY` 로테이션 (과거 채팅 기록에 평문 노출).
  `oci-server.md`에 기록된 미결 사항이며 이번 작업에서도 처리하지 않았다.
- 마이그레이션 009/010(`meetings.analysis_job_id`, `rag_assignee_sync_failures`)에
  해당하는 SQL 파일이 레포에 없다. `db/migration`에는 `V20260721_1` 하나뿐인데
  readiness와 배포 preflight는 두 객체의 존재를 검사한다. Supabase에 수동 적용된
  것으로 보이며, 신규 환경 구축 시 재현이 불가능하다.
- **롤백의 변경 구간은 여전히 미검증이다.** 판정부(메트릭 수집·가드)와 대상 선택은
  서버에서 실측했지만, 그 뒤의 `docker stop` → `git reset --hard` → `compose up`은
  실행해 본 적이 없다. 운영에서 강제 실패를 유도할 수는 없으므로 스테이징 환경이
  필요하다. 스테이징이 없는 현재로서는 이 구간이 남은 최대 위험이다.
- **`deploy-last-good` 태그가 아직 서버에 없다.** 다음 배포가 헬스체크를 통과하면
  자동으로 생기지만, 그전까지는 롤백 대상이 없다. 즉시 해소하려면 서버에서 현재 정상
  HEAD에 태그를 찍는다. 접속 절차와 자격 증명은 `oci-server.md`(레포 미추적) 참조.

  ```bash
  git -C /home/ubuntu/work-flow tag -f deploy-last-good HEAD   # ubuntu 계정으로 실행
  ```
- Docker 빌드 캐시 9.6GB (회수 가능 4.9GB). 디스크는 46%로 여유가 있어 시급하지 않다.

## 관련 문서

- [oci-server.md](../../document_고무서/oci-server.md) — 서버 운영 노트 (커밋 금지)
- [2026-07-23-redis-queue-oci.md](2026-07-23-redis-queue-oci.md)
