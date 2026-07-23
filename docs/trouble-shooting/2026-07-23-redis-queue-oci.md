# OCI Redis queue·cache 장애 대응

날짜: 2026-07-23

## 안전 원칙

- 실제 비밀번호, 토큰, Redis payload를 터미널 출력·CI 로그·보고서에 남기지 않는다.
- `set -x`, `redis-cli --pass`, `XRANGE`, `XREAD`, `KEYS *`를 사용하지 않는다.
- 아래 명령은 `/home/ubuntu/work-flow/App`에서 실행한다.
- 진단 중에는 새 회의 업로드를 중단하고, queue를 수동 `XACK`/`XDEL`하지 않는다.

```bash
test -f .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

## 1. 기본 readiness 진단

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin ping'
curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null
curl -fsS http://127.0.0.1:8080/api/v1/health >/dev/null
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XINFO GROUPS meeting-analysis' \
  | grep -qx meeting-analysis-workers
```

Spring readiness가 503이면 Redis 연결, consumer group 초기화, Worker 생존 중 하나가 실패한 것이다.
Worker가 비동기로 초기화되므로 기동 직후에는 최대 150초 동안 재시도하고 바로 group을 수동 생성하지 않는다.

## 2. ACL 인증 실패

값을 출력하지 않고 Compose와 Redis 컨테이너에서 세 변수가 존재하는지만 확인한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'test -n "$REDIS_ADMIN_PASSWORD" && test -n "$REDIS_SPRING_PASSWORD" && test -n "$REDIS_FASTAPI_PASSWORD"'
```

누락되었으면 OCI `.env`를 secret manager의 최신 값으로 갱신한 뒤 Redis, Spring, FastAPI를 함께
재생성한다. 서로 다른 세 비밀번호가 32~128자의 영숫자·밑줄·하이픈 형식인지 확인한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate \
  redis backend-spring backend-fastapi
```

## 3. AOF 또는 Redis 재시작 문제

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin CONFIG GET appendonly appendfsync maxmemory-policy'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin INFO persistence' \
  | grep -E '^(aof_enabled|aof_last_write_status|aof_last_bgrewrite_status):'
docker volume inspect app_redis-data >/dev/null
```

`appendonly=yes`, `appendfsync=everysec`, `maxmemory-policy=noeviction`, AOF write status가 `ok`여야 한다.
AOF 오류면 디스크 여유와 volume mount를 확인하고 신규 업로드를 중단한다. volume을 삭제하거나
`docker compose down --volumes`를 실행하지 않는다.

## 4. queue 길이·pending·consumer group 진단

다음 명령은 payload를 읽지 않고 개수와 group 메타데이터만 확인한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XLEN meeting-analysis'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XINFO GROUPS meeting-analysis'
```

group이 없거나 pending이 줄지 않으면 Spring 로그에서 exception 종류만 확인하고 payload 관련 행은
출력하지 않는다. 그 다음 Spring을 재시작해 동일 consumer의 pending 복구를 유도한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend-spring
spring_ready=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/v1/health >/dev/null; then
    spring_ready=1
    break
  fi
  sleep 5
done
test "$spring_ready" = 1
```

재시작 후에도 pending이 유지되면 해당 meeting의 DB 상태가 `processing`, `completed`, `failed` 중
무엇인지 확인한다. `completed`/`failed` 멱등 skip이 동작하지 않은 경우 코드 버전을 복구한 뒤
Worker가 ACK하도록 하며, 운영자가 Redis에서 메시지를 직접 삭제하지 않는다.

## 5. enqueue 실패 후 PROCESSING 고착

Redis 장애 중 생성된 회의는 enqueue 실패 보상 트랜잭션으로 `FAILED`가 되어야 한다. 인증된 상태 API로
확인하고, `PROCESSING`에 남으면 신규 업로드를 차단한다.

```bash
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://<도메인>/api/v1/projects/$PROJECT_ID/meetings/$MEETING_ID/status"
```

Redis PING과 Spring readiness를 복구한 뒤에만 공식 retry API 또는 UI 재시도를 사용한다. DB 상태를
임의 SQL로 변경하면 enqueue와 상태가 다시 불일치할 수 있다.

## 6. cache 장애

cache 장애는 회의 분석과 RAG 응답을 실패시키지 않고 cache miss로 처리되어야 한다. key 이름의 개수만
확인하고 값을 `GET`하거나 실제 질문·회의 원문을 출력하지 않는다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin SCAN 0 MATCH "meeting_analysis:*" COUNT 100' \
  >/dev/null
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin SCAN 0 MATCH "rag_answer:*" COUNT 100' \
  >/dev/null
```

동일 fixture 요청의 두 번째 응답 시간이 줄지 않으면 FastAPI 경고의 종류만 확인하고 ACL 사용자,
Redis 연결, TTL 설정을 순서대로 점검한다.

## 7. payload 로그 유출 검사

실데이터 대신 고유한 비민감 fixture marker를 사용한다. `grep` 결과는 절대 출력하지 않는다.

```bash
if docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend-spring backend-fastapi 2>&1 \
  | grep -Fq 'OCI_PAYLOAD_SENTINEL_DO_NOT_LOG'; then
  echo "WARNING: payload marker found in logs"
else
  echo "payload marker absent from logs"
fi
```

marker가 발견되면 관련 로그의 외부 전송을 중단하고 보존 정책에 따라 폐기한 뒤 payload를 기록한
로그 구문을 제거한다. 실제 payload를 이슈에 복사하지 않는다.

## 8. rollback

rollback 전에 위의 `XLEN meeting-analysis`와
`XPENDING meeting-analysis meeting-analysis-workers` 첫 줄만 기록한다.

**이전 코드는 Redis Stream을 drain할 수 없습니다.** queue 또는 pending이 0이 아니면 신규 요청을
막고 현재 버전 Worker로 drain하거나 DB 상태와 함께 수동 복구 계획을 확정하기 전에는 rollback하지
않는다. rollback 후에는 public health뿐 아니라 Redis PING, local FastAPI health, local Spring
readiness와 consumer group을 다시 확인한다.

모든 Redis 명령은 컨테이너 내부 환경변수로 인증하므로 호스트 셸에 비밀번호를 export하지 않는다.
