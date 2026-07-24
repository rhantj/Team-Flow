# OCI 배포 런북

대상 서버: `workflow-ai-oci` (161.33.132.66, Ubuntu 24.04 ARM, 2 OCPU / 12GB)

설계 배경과 결정 근거는 [배포 설계 문서](../docs/superpowers/specs/2026-07-17-oci-deployment-design.md) 참고.

이번 배포에서 **Ollama(로컬 LLM)는 제외**한다. RAG 검색/생성은 동작하지 않고,
회의 분석은 Spring의 `FallbackMeetingAnalyzer`가 대신 처리한다. 앱은 정상 동작한다.

---

## 1. 도메인 준비

구글 OAuth는 리디렉션 URI에 **HTTPS와 실제 도메인을 강제**한다. 생 IP(`161.33.132.66`)는
HTTP라서 한 번, IP라서 또 한 번 거부되므로 도메인이 반드시 필요하다.

[DuckDNS](https://www.duckdns.org) 등에서 무료 서브도메인을 받아 `161.33.132.66`에 연결한다.

연결됐는지 확인:

```bash
dig +short <도메인>     # 161.33.132.66 이 나와야 함
```

## 2. OCI Security List에 80/443 열기

콘솔 → 인스턴스 → 가상 클라우드 네트워크(`workflow-vcn`) → 서브넷 → 보안 목록 →
수신 규칙 추가. 기본은 22만 열려 있다.

| 소스 CIDR | 프로토콜 | 대상 포트 |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

## 3. 서버 iptables 열기

**OCI Ubuntu 이미지는 22를 제외한 모든 포트를 iptables로 차단한다.** 위 2번만 하고
여기서 막히는 게 OCI의 대표적 함정이다.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save     # 재부팅 후에도 유지
```

> Docker가 publish한 포트는 nat/FORWARD 체인으로 처리돼 **INPUT 규칙을 우회한다.**
> 그래서 위 규칙은 nginx 노출용일 뿐, DB 보호 수단이 아니다. DB·Redis·Kafka는
> `docker-compose.prod.yml`이 외부 게시를 제거하거나 `127.0.0.1`에만 바인딩해서 막는다.

## 4. Docker 설치

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker
```

`docker compose version`이 **v2.24 이상**이어야 한다. `docker-compose.prod.yml`이
쓰는 `!override` 태그가 그 버전부터 지원된다.

## 5. 코드 내려받기 + .env 작성

```bash
git clone https://github.com/rhantj/work-flow.git
cd work-flow/App
cp .env.example .env
```

`.env`에서 반드시 바꿀 값:

```bash
POSTGRES_PASSWORD=<길고 무작위한 값>          # 기본값 root 절대 금지
JWT_SECRET=<32바이트 이상 무작위 문자열>
REDIS_ADMIN_PASSWORD=<32~128자 영숫자·밑줄·하이픈>
REDIS_SPRING_PASSWORD=<위와 다른 32~128자 값>
REDIS_FASTAPI_PASSWORD=<위 두 값과 다른 32~128자 값>
GOOGLE_CLIENT_ID=<구글 콘솔 값>
GOOGLE_CLIENT_SECRET=<구글 콘솔 값>
GOOGLE_REDIRECT_URI=https://<도메인>/api/v1/auth/google/callback
WORKFLOW_FRONTEND_BASE_URL=https://<도메인>
WORKFLOW_CORS_ORIGINS=https://<도메인>
```

무작위 값 생성:

```bash
openssl rand -base64 36
```

Redis ACL 비밀번호는 특수문자 제한이 있으므로 각각 `openssl rand -hex 32`로 생성한다.
세 값 중 하나라도 비어 있으면 운영 Compose와 배포 workflow가 즉시 실패한다.
workflow는 서비스 변경 전에 세 값의 길이·허용 문자·상호 중복을 검사한다. 이 검사를 통과하지
못하면 기존 컨테이너는 건드리지 않는다.

### Redis Stream 최초 전환 주의

이 릴리스는 기존 버전이 처리할 수 없는 Redis Stream과 세 개의 Redis ACL 비밀번호를 도입하는
파괴적 전환이다. 고정 `container_name` 단일 Compose 배포이므로 무중단 배포가 아니다. 최초
전환은 maintenance window에서 수행하고 OCI `.env`에 서로 다른 Redis 비밀번호 세 개를 먼저
프로비저닝한다. 이전 버전으로 되돌릴 수 있는 조건은 `XLEN=0`, `XPENDING=0`뿐이다.

Spring liveness는 `/api/v1/health/live`, Redis·Worker를 포함한 readiness는
`/api/v1/health/ready`다. 트래픽 및 배포 판정에는 readiness를 사용한다.

### 이전에 노출된 자격 증명 회전

이 저장소나 CI 로그, 채팅, 보고서에 한 번이라도 값이 노출됐던 자격 증명은 배포 전에
**모두 폐기하고 새 값으로 회전해야 한다.** 기존 값을 재사용하거나 이 문서에 실제 값을 기록하지 않는다.

- Hugging Face: `HF_TOKEN`, `HUGGINGFACEHUB_API_TOKEN`
- LangSmith: `LANGSMITH_API_KEY`
- Google OAuth: `GOOGLE_CLIENT_SECRET`
- 내부 API: `RAG_INTERNAL_API_KEY`
- DB: `POSTGRES_PASSWORD`, `SPRING_DATASOURCE_PASSWORD`, `DATABASE_URL`에 포함된 비밀번호
- 애플리케이션 서명: `JWT_SECRET`
- Redis ACL: `REDIS_ADMIN_PASSWORD`, `REDIS_SPRING_PASSWORD`, `REDIS_FASTAPI_PASSWORD`

각 공급자 콘솔에서 기존 토큰을 먼저 revoke한 뒤 OCI의 `.env`만 갱신한다. `.env`의 값,
토큰 일부, 해시를 터미널 출력이나 작업 기록에 붙여 넣지 않는다.

## 6. 구글 콘솔에 리디렉션 URI 등록

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 클라이언트 ID →
**승인된 리디렉션 URI**에 아래를 추가한다. `.env`의 `GOOGLE_REDIRECT_URI`와 한 글자도 다르면 안 된다.

```
https://<도메인>/api/v1/auth/google/callback
```

## 7. 인증서 발급 + 기동

```bash
cd work-flow/App
DOMAIN=<도메인> EMAIL=<이메일> bash scripts/init-letsencrypt.sh
```

처음이라면 `STAGING=1`을 붙여 시험 발급을 먼저 해보는 걸 권한다. Let's Encrypt는
운영 환경에서 **주당 5회 실패 제한**이 있어서, 설정이 틀린 채로 반복하면 일주일간 막힌다.

```bash
STAGING=1 DOMAIN=<도메인> EMAIL=<이메일> bash scripts/init-letsencrypt.sh
```

성공하면 `sudo rm -rf /etc/letsencrypt/live/<도메인>` 후 `STAGING` 없이 다시 실행한다.

이후 배포는 아래 한 줄이다:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

첫 빌드는 2 OCPU에서 **10~20분** 걸린다 (Gradle + pnpm + pip).

## 8. DB 마이그레이션 적용 (신규 앱 기동 전 필수, 이후 스키마 변경도 항상 수동 적용)

> 📋 **배포 전 실행할 SQL은 [`App/DEPLOY_MANUAL.sql`](DEPLOY_MANUAL.sql)에 모아둔다.**
> 지금 이 시점 기준으로는 `terms_agreed_at` 하나뿐이다 — `field_tags`/`profile_image_path`/
> `affiliation`/`github_username`은 이미 007/008(아래 for 루프)로 과거에 적용된 이력이 있다.
> ```bash
> docker exec -i workflow-db psql -U postgres -d workflow < App/DEPLOY_MANUAL.sql
> ```
> `\d users`로 컬럼이 생겼는지 확인한 뒤에만 새 백엔드 이미지를 배포할 것 — 순서를 바꾸면
> `ddl-auto=validate`가 기동을 막는다. 새 스키마 변경을 추가할 때마다 이 파일도 함께
> 갱신할 것(아래 체크리스트 참고).

compose는 `backend_spring/src/main/resources/db/init`만 자동 실행한다. `docs/db/migrations`는
운영 DB에 스키마 변경을 수동으로 적용하는 방식으로, 이 환경을 **아직 한 번도 001~010까지
못 따라잡았다면** 아래 for 루프로 캐치업시켜야 한다. 이미 001~010이 적용된 환경(기존 운영
서버 재배포 등)이라면
대부분은 이 루프를 다시 돌릴 필요가 없지만, 아래 두 파일만은 예외다 — 신규 Spring 이미지를
기동하기 전에 실제 DB에 이 스키마가 있는지 **반드시 먼저 확인**할 것:

- `009_rag_assignee_sync_failures.sql` — RAG 담당자 동기화 outbox 테이블. 없으면 담당자
  동기화 실패 기록이 저장되지 않는다.
- `010_meetings_analysis_job_id.sql` — `meetings.analysis_job_id`. Redis Stream 세대
  펜싱에 쓰이며, 없으면 신규 Spring 이미지가 Redis Stream consumer를 기동하지 못한다.

OCI 자동 배포 workflow도 기동 전에 이 두 스키마의 존재를 확인해서, 누락 시 기존 서비스를
건드리지 않고 배포를 중단한다.

init 스크립트는 `document_chunks.embedding`을 JSONB로 만들고, 마이그레이션 001이 이걸
`VECTOR(768)`로, 007이 다시 `VECTOR(1024)`로 바꾼다(RAG 챗봇 임베딩 모델이
Ollama/nomic-embed-text(768차원)에서 Hugging Face/BAAI/bge-m3(1024차원)로 전환됨에 따른
스키마 변경). 001과 007을 건너뛰면 임베딩 기능이 나중에 깨진다.

```bash
cd work-flow
for f in docs/db/migrations/0*.sql; do
  case "$f" in
    *011_drop_legacy_field.sql) continue ;;  # 8-1절에서 별도로, 수동으로만 실행한다
  esac
  echo "적용: $f"
  docker exec -i workflow-db psql -U postgres -d workflow < "$f"
done
```

Supabase 운영 환경에서는 연결된 프로젝트에 CLI 마이그레이션을 먼저 적용한다.

```bash
supabase db push --linked
supabase migration list --linked
```

> 두 디렉터리를 합칠 수 없는 이유: `docker-entrypoint-initdb.d`는 알파벳순으로 실행하는데
> `001_`이 `01_`보다 앞서서 순서가 뒤집힌다.

> ⚠️ **007만은 재실행 시 위험하다:** 007은 `document_chunks.embedding`을 전부 `NULL`로
> 초기화하는 파괴적 변경이라, 이미 재임베딩까지 끝난 운영 DB에 실수로 다시 실행하면
> 재임베딩을 마칠 때까지 RAG 검색이 완전히 빈 결과만 반환한다. 007 자체에는 컬럼이 이미
> `vector(1024)`면 건너뛰는 idempotency guard가 있지만, **처음 007을 적용하는 배포에서만**
> 아래 재임베딩 절차를 실행할 것.

**007 적용 후 반드시 재임베딩을 실행할 것(최초 1회만).** 007은 컬럼 타입만 바꾸고 기존
임베딩 값은 NULL로 비운다(차원이 달라 기존 벡터를 그대로 옮길 수 없음) — 재임베딩 없이는
`document_chunks` 검색이 전부 빈 결과를 반환한다.

```bash
cd work-flow/App/backend_fastapi
python -m llm_rag_assistant.scripts.reembed_document_chunks
```

**이 저장소는 Flyway 등 자동 마이그레이션 도구를 쓰지 않는다.** 한때 Flyway를 도입했다가
운영 활성화 여부(`true`/`false`)를 둘러싸고 설정·문서·커밋 메시지가 반복적으로 어긋나는
문제가 계속 발생해, 자동화 자체를 걷어내고 "배포 전 사람이 직접 psql로 적용" 방식으로
되돌렸다. 대신 `spring.jpa.hibernate.ddl-auto=validate`(`application.yml`/
`application-prod.yml`)를 항상 켜둔다 — 이 수동 절차를 빠뜨리면 애플리케이션이 틀린
스키마로 기동하는 대신, Hibernate가 매핑과 실제 DB 컬럼 불일치를 감지해 기동 자체를
막아준다. **`ddl-auto=update`로 바꾸지 말 것** — Hibernate가 운영 DB에 대해 예측 불가능한
DDL을 자동 생성/실행할 수 있어(컬럼 삭제·타입 변경 오판단 등) 데이터 손실 위험이 있다.

**새 스키마 변경 체크리스트 (필수, 배포 전에 순서대로):**

1. `docs/db/migrations/`에 다음 번호로 `NNN_설명.sql` 파일을 추가한다(예:
   `013_추가내용.sql`) — 운영(Supabase/OCI) DB에 실제로 적용한 이력을 남기는 곳이다.
2. `backend_spring/src/main/resources/db/init/`에도 같은 내용의 파일을 다음 번호로 추가한다
   (예: `11_추가내용.sql`) — 완전히 새로 만드는 DB(로컬 최초 기동, 신규 환경)의 유일한
   스키마 소스이므로, 여기 반영하지 않으면 새 DB에서는 그 컬럼이 영원히 생기지 않는다.
3. **코드를 머지/배포하기 전에** 1번 파일을 실제 운영 DB에 `psql`로 직접 실행한다:
   ```bash
   docker exec -i workflow-db psql -U postgres -d workflow < docs/db/migrations/013_추가내용.sql
   ```
   (Supabase라면 `supabase db push --linked` 또는 해당 SQL을 직접 실행.) **순서가 중요하다**
   — 새 컬럼을 참조하는 코드가 먼저 배포되면 `ddl-auto=validate`가 기동을 막는다.
4. 적용 후 `\d <테이블명>`으로 컬럼이 실제로 생겼는지 확인한 뒤에만 코드를 배포한다.
5. [`App/DEPLOY_MANUAL.sql`](DEPLOY_MANUAL.sql)에 방금 만든 `docs/db/migrations/NNN_*.sql`
   내용을 추가해, 다음에 새 환경을 배포하는 사람이 "지금 시점에 실행할 SQL 전체"를 한 파일로
   받을 수 있게 한다.

파괴적 변경(컬럼/테이블 삭제, 타입 변경 등)은 8-1절의 `011_drop_legacy_field.sql` 패턴처럼
RENAME으로 먼저 보관하고, 실제 DROP은 최소 한 배포 주기 이상 문제 없음을 확인한 뒤 별도로
실행할 것 — 무중단 배포 중에는 구버전 인스턴스가 아직 옛 컬럼명을 참조하고 있을 수 있다.

## 8-1. (보류) 레거시 users.field 정리

> [!WARNING]
> **하위 호환성 유지 및 롤백 안전성을 위해 이번 배포 주기에서는 `011_drop_legacy_field.sql`을 실행하지 않고 보류합니다.**
> 새 애플리케이션 코드는 `field_tags`만 사용하고 레거시 `field` 컬럼은 전혀 참조하지 않지만, 배포 도중 구버전 인스턴스가 기동되어 있거나 장애 시 구버전으로 즉시 롤백해야 하는 경우 `field` 컬럼이 없으면 구버전 인스턴스가 오작동하여 전체 서비스 장애로 이어집니다.
> 두 컬럼(`field`, `field_tags`)이 DB에 공존하는 상태가 가장 안전하며, 신규 버전 배포 완료 및 안정성이 검증된 다음 릴리스 주기에서 `011_drop_legacy_field.sql`의 주석을 해제해 수동으로 정리할 예정입니다.
> **이중 안전장치:** "실행하지 않는다"는 운영 절차뿐 아니라, `011_drop_legacy_field.sql` 자체에서도
> `ALTER TABLE ... RENAME/DROP` 구문을 주석 처리해뒀다 — 누군가 실수로 이 파일을 돌려도 아무
> 컬럼도 바뀌지 않는 안전한 no-op이다. 모든 인스턴스가 `field_tags` 기반 코드로 교체됐다고
> 확인된 뒤에만 파일 내 주석을 해제해 재활성화할 것.

> ⚠️ **`db/init/09_drop_legacy_field.sql`은 이것과 다르다 — 자동으로 실행된다.** `db/init`은
> `docker-entrypoint-initdb.d`로 매핑돼 있어, **완전히 빈 Postgres 볼륨을 처음 만들 때만**
> 01부터 09까지 순서대로 자동 실행된다(로컬 `docker compose up` 최초 기동, 또는 OCI에서
> `docker-compose down -v` 후 재기동 등). 이 시점엔 아직 데이터도 없고 접속 중인 백엔드
> 인스턴스도 하나도 없으므로 같은 rename이라도 위험하지 않다 — "구버전 인스턴스를 깨뜨린다"는
> 위험은 오직 **이미 운영 중인, 데이터가 있는 DB**에 뒤늦게 적용할 때(=011의 시나리오)만
> 발생한다. 반대로 이미 데이터가 있는 볼륨을 재사용해 컨테이너만 재기동하면 Postgres는
> `docker-entrypoint-initdb.d`를 다시 실행하지 않으므로 09도 다시 돌지 않는다.

## 9. 검증

```bash
curl -I  https://<도메인>/                      # 200, 인증서 유효
curl -fsS https://<도메인>/api/v1/health/ready  # 200

# 아래는 전부 실패(404)해야 정상 — prod 프로필이 걸렸다는 뜻
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/api/v1/auth/dev-login/1
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/swagger-ui/index.html

# 외부에서 내부 포트가 안 보여야 정상 (모두 타임아웃/거부)
for port in 5432 6379 9092 8000 8080; do
  nc -zvw3 <도메인> "$port" && echo "UNEXPECTED OPEN: $port" && exit 1
done
```

브라우저에서 구글 로그인 → 보드 진입까지 확인한다.

### Redis AOF·ACL·queue readiness

OCI의 `App` 디렉터리에서 실행한다. 실제 비밀번호를 출력하지 않으며 `set -x`를 사용하지 않는다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin ping'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin CONFIG GET appendonly appendfsync maxmemory maxmemory-policy auto-aof-rewrite-percentage auto-aof-rewrite-min-size'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XINFO GROUPS meeting-analysis' \
  | grep -qx meeting-analysis-workers
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis sh -ec '
  spring() { REDISCLI_AUTH="$REDIS_SPRING_PASSWORD" redis-cli --raw --user spring "$@"; }
  fastapi() { REDISCLI_AUTH="$REDIS_FASTAPI_PASSWORD" redis-cli --raw --user fastapi "$@"; }
  default_denied=$(redis-cli --raw ping 2>&1 || true)
  case "$default_denied" in *NOAUTH*) ;; *) exit 1 ;; esac
  spring ping >/dev/null
  spring_denied=$(spring get meeting_analysis:acl-runbook 2>&1 || true)
  case "$spring_denied" in *NOPERM*) ;; *) exit 1 ;; esac
  fastapi set meeting_analysis:acl-runbook fixture >/dev/null
  fastapi del meeting_analysis:acl-runbook >/dev/null
  fastapi_denied=$(fastapi xlen meeting-analysis 2>&1 || true)
  case "$fastapi_denied" in *NOPERM*) ;; *) exit 1 ;; esac
'
curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null
curl -fsS http://127.0.0.1:8080/api/v1/health/ready >/dev/null
```

`appendonly=yes`, `appendfsync=everysec`, `maxmemory-policy=noeviction`이어야 한다. `ACL LIST`은
비밀번호 해시를 포함할 수 있으므로 배포 로그나 보고서에 출력하지 않는다.

### Spring 강제 종료 후 pending 복구

1. UI에서 테스트 회의록을 업로드하고 반환된 ID를 `MEETING_ID`로 기록한다.
2. 아래 명령의 `XPENDING` 첫 줄이 1 이상일 때 Spring 컨테이너를 강제 종료한다. 명령은
   메시지 ID·payload를 출력하지 않고 pending 개수만 출력한다.
3. Spring을 다시 시작한다. Worker는 인스턴스별 consumer 이름을 사용하며 다른 consumer에 남은
   pending이 10분 이상 idle이면 `XPENDING`/`XCLAIM`으로 회수한다. 실행 중에는 1분마다 현재
   consumer의 pending lease를 갱신해 정상 장기 작업이 다른 인스턴스에 회수되지 않게 한다.
   상태가 `completed` 또는 `failed`가 되고 pending 개수가 0인지 확인한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p'
docker kill workflow-backend-spring
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend-spring
spring_ready=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/v1/health/ready >/dev/null; then
    spring_ready=1
    break
  fi
  sleep 5
done
test "$spring_ready" = 1
pending_after=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p')
test "$pending_after" = 0
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://<도메인>/api/v1/projects/$PROJECT_ID/meetings/$MEETING_ID/status"
```

### Redis 컨테이너 재생성 후 AOF persistence

실행 전후 `XLEN`과 `XPENDING` 첫 줄만 별도 메모하고 payload는 조회하지 않는다. 두 값이 유지되어야 한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop backend-spring
before_length=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XLEN meeting-analysis')
before_pending=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p')
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate redis
redis_ready=0
for attempt in $(seq 1 30); do
  if docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
      sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin ping' \
      2>/dev/null | grep -qx PONG; then
    redis_ready=1
    break
  fi
  sleep 2
done
test "$redis_ready" = 1
after_length=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XLEN meeting-analysis')
after_pending=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p')
test "$after_length" = "$before_length"
test "$after_pending" = "$before_pending"
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend-spring
```

재생성 후 Redis PING, `XLEN`, `XPENDING` 비교가 모두 통과해야 한다. named volume의 AOF가 유지되지 않으면
추가 업로드를 중단하고 복구한다.

### queue drain 후 AOF plaintext 제거

AOF에는 삭제 전 회의 payload가 평문으로 남을 수 있다. 신규 업로드를 막고 queue를 정상 처리한 뒤,
`XLEN`과 `XPENDING`이 모두 정확한 숫자 `0`일 때만 인증된 `BGREWRITEAOF`를 실행한다. 이 절차에서
`XRANGE`, `XREAD`, `GET` 등으로 payload 조회 금지이며 개수와 persistence 상태만 확인한다.

```bash
queue_length=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XLEN meeting-analysis')
queue_pending=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p')
printf '%s\n' "$queue_length" | grep -Eq '^[0-9]+$'
printf '%s\n' "$queue_pending" | grep -Eq '^[0-9]+$'
test "$queue_length" = 0
test "$queue_pending" = 0
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin BGREWRITEAOF' \
  | grep -Eq 'Background append only file rewriting started|Background append only file rewriting scheduled'
rewrite_ok=0
for attempt in $(seq 1 60); do
  rewrite_status=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis \
    sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin INFO persistence' \
    | grep -E '^(aof_rewrite_in_progress|aof_rewrite_scheduled|aof_last_bgrewrite_status):')
  if printf '%s\n' "$rewrite_status" | grep -q '^aof_rewrite_in_progress:0' \
    && printf '%s\n' "$rewrite_status" | grep -q '^aof_rewrite_scheduled:0' \
    && printf '%s\n' "$rewrite_status" | grep -q '^aof_last_bgrewrite_status:ok'; then
    rewrite_ok=1
    break
  fi
  sleep 2
done
test "$rewrite_ok" = 1
```

`unavailable`, 빈 값, 비숫자 또는 0이 아닌 값이면 fail closed로 중단하고 manual drain/compensation을
완료한 뒤 다시 실행한다. 또한 OCI 콘솔에서 Redis 데이터가 있는 boot/block volume과 backup의 저장
암호화가 활성화됐는지, volume 접근 권한이 최소 인원으로 제한됐는지, backup 보존 기간과 삭제 정책이
승인된 운영 정책과 일치하는지 확인한다.

### Redis enqueue 실패가 FAILED로 전환되는지 확인

테스트 회의만 사용한다. Redis를 멈춘 상태에서 UI로 회의록을 한 건 업로드하고, 응답으로 받은 회의가
`FAILED` 상태인지 확인한 뒤 Redis와 Spring을 복구한다. `PROCESSING`에 남으면 배포를 중단한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop redis
# UI에서 테스트 회의 1건 업로드 후 MEETING_ID 기록
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://<도메인>/api/v1/projects/$PROJECT_ID/meetings/$MEETING_ID/status"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend-spring
```

### 회의 분석·RAG cache hit

- 회의 분석: 민감하지 않은 fixture를 동일 입력으로 두 번 분석한다. 두 응답이 같고 두 번째 응답 시간이
  짧아지며 admin 계정으로 key 이름만 조회했을 때 `meeting_analysis:` key가 생성되는지 확인한다.
- RAG: 같은 프로젝트·사용자 범위에서 완전히 같은 질문을 두 번 요청한다. 응답과 source가 같고 두 번째
  시간이 짧아지며 `rag_answer:` key가 생성되는지 확인한다.
- 업무·회의·프로젝트를 수정하거나 삭제한 뒤 같은 질문을 다시 요청한다. `rag_epoch:<projectId>`가
  증가하고 이전 답변 cache가 재사용되지 않으며 삭제한 source가 응답에 포함되지 않아야 한다.
- FastAPI를 잠시 중지한 상태에서 삭제·담당자 변경을 수행하면 `rag_assignee_sync_failures`에
  outbox 레코드가 남고, FastAPI 복구 후 스케줄러가 현재 DB 상태에 맞게 재처리해 제거하는지 확인한다.
- 브라우저 Network timing이나 `curl -w '%{time_total}'`만 기록한다. 질문, 회의 원문, 응답 payload는
  CI 로그나 보고서에 남기지 않는다.

### payload 로그 유출 검사

테스트 fixture에 민감하지 않은 고유 sentinel을 넣고 요청한 뒤, 일치 여부만 검사한다. `grep` 결과 자체를
출력하면 원문이 함께 노출될 수 있으므로 반드시 `-q`와 출력 리다이렉션을 사용한다.

```bash
if docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend-spring backend-fastapi 2>&1 \
  | grep -Fq 'OCI_PAYLOAD_SENTINEL_DO_NOT_LOG'; then
  echo "WARNING: payload marker found in logs"
  exit 1
fi
echo "payload marker absent from logs"
```

### rollback 전 queue 주의

이전 코드는 Redis Stream과 새 RAG 삭제·담당자·인제스트 outbox를 처리할 수 없습니다. rollback 전에 반드시
`XLEN meeting-analysis`, `XPENDING meeting-analysis meeting-analysis-workers`, 그리고
`rag_assignee_sync_failures`의 `delete:*`·`delete_project`·`sync:*`·`ingest:*` 개수만 기록한다. 세 값이
정확한 숫자 `0/0/0`인 경우에만 자동 rollback한다. 하나라도 `unavailable`, 빈 값, 비숫자 또는
0이 아닌 값이면 fail closed로 자동 rollback을 중단하고 신규 업로드를 막은 뒤
manual drain/compensation을 완료한다.

자동 rollback workflow는 최종 지표 수집 직전에 실행 중인 Spring을
`docker stop --time 60 workflow-backend-spring`으로 먼저 정지해 ingress와 Worker를 quiesce한다.
컨테이너가 없거나 이미 정지된 경우는 그대로 진행하지만, 실행 중인 컨테이너 정지에 실패하면 rollback을
중단한다. 최종 지표가 0/0/0이 아니거나 조회 불가이면 다음 절차로 현재 feature 버전을 drain한다.
payload 조회와 수동 XACK/XDEL 금지이며 개수만 확인한다.

```bash
docker stop workflow-frontend
docker start workflow-backend-spring
drain_complete=0
for attempt in $(seq 1 60); do
  drain_length=$(docker exec workflow-redis \
    sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XLEN meeting-analysis' \
    2>/dev/null || printf unavailable)
  drain_pending=$(docker exec workflow-redis \
    sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
    2>/dev/null | sed -n '1p' || printf unavailable)
  if printf '%s\n' "$drain_length" | grep -Eq '^[0-9]+$' \
    && printf '%s\n' "$drain_pending" | grep -Eq '^[0-9]+$' \
    && [ "$drain_length" -eq 0 ] && [ "$drain_pending" -eq 0 ]; then
    drain_complete=1
    break
  fi
  sleep 5
done
docker stop --time 60 workflow-backend-spring
test "$drain_complete" = 1
final_length=$(docker exec workflow-redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XLEN meeting-analysis')
final_pending=$(docker exec workflow-redis \
  sh -c 'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin XPENDING meeting-analysis meeting-analysis-workers' \
  | sed -n '1p')
printf '%s\n' "$final_length" | grep -Eq '^[0-9]+$'
printf '%s\n' "$final_pending" | grep -Eq '^[0-9]+$'
test "$final_length" = 0
test "$final_pending" = 0
```

최종 0/0 확인 후에만 선택한 버전으로 수동 rollback하거나 DB compensation을 완료한다. Redis PING,
선택 버전의 local FastAPI/Spring health와 consumer group을 확인한 다음에만
`docker start workflow-frontend`로 public ingress를 복구한다.

## 문제 해결

**80/443이 안 열린다** — 2번(Security List)과 3번(iptables)을 둘 다 했는지 확인.
하나만 하면 안 된다. `sudo iptables -L INPUT -n --line-numbers`로 규칙을 확인한다.

**구글 로그인이 `redirect_uri_mismatch`** — `.env`의 `GOOGLE_REDIRECT_URI`와 구글 콘솔에
등록한 값이 정확히 같아야 한다. 끝의 슬래시 하나도 다르면 안 된다.

**로그인 후 http://로 튕긴다** — `SERVER_FORWARD_HEADERS_STRATEGY=framework`가 적용됐는지,
nginx가 `X-Forwarded-Proto`를 넘기는지 확인한다. 둘 다 `docker-compose.prod.yml`과
`nginx.prod.conf`에 들어 있다.

**빌드 중 OOM** — 12GB면 충분하지만, 실행 중인 스택과 빌드가 겹치면 빠듯할 수 있다.
`docker compose ... down` 후 빌드하거나 스왑을 임시로 추가한다.

**인증서 갱신 확인**

```bash
docker exec workflow-certbot certbot certificates
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs certbot
```
