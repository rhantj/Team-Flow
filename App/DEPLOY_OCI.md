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
> `docker-compose.prod.yml`이 `127.0.0.1`에만 바인딩해서 막는다.

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

## 8. DB 마이그레이션 적용 (첫 기동 후 1회)

compose는 `backend_spring/src/main/resources/db/init`만 자동 실행한다.
`docs/db/migrations/001~011`은 **수동으로 적용해야 한다.**

init 스크립트는 `document_chunks.embedding`을 JSONB로 만들고, 마이그레이션 001이 이걸
`VECTOR(768)`로, 007이 다시 `VECTOR(1024)`로 바꾼다(RAG 챗봇 임베딩 모델이
Ollama/nomic-embed-text(768차원)에서 Hugging Face/BAAI/bge-m3(1024차원)로 전환됨에 따른
스키마 변경). 001과 007을 건너뛰면 임베딩 기능이 나중에 깨진다.

```bash
cd work-flow
for f in docs/db/migrations/0*.sql; do
  echo "적용: $f"
  docker exec -i workflow-db psql -U postgres -d workflow < "$f"
done
```

> 두 디렉터리를 합칠 수 없는 이유: `docker-entrypoint-initdb.d`는 알파벳순으로 실행하는데
> `001_`이 `01_`보다 앞서서 순서가 뒤집힌다.

> ⚠️ **재실행 위험(001~007 전체 공통):** 이 저장소는 Flyway 등 마이그레이션 이력
> 추적을 쓰지 않는다(`SPRING_FLYWAY_ENABLED` 기본 false) — 즉 어떤 마이그레이션을
> 이미 적용했는지 DB가 스스로 기억하지 못한다. 위 for 루프는 **재배포할 때마다
> 001~007을 처음부터 다시 실행**하므로, 나머지 마이그레이션은 대부분 `IF NOT EXISTS` 등으로
> 안전하지만 **007만은 특히 위험하다**: 007은 `document_chunks.embedding`을 전부
> `NULL`로 초기화하는 파괴적 변경이라, 이미 재임베딩까지 끝난 운영 DB에 실수로
> 다시 실행하면 재임베딩을 마칠 때까지 RAG 검색이 완전히 빈 결과만 반환한다.
> 007 자체에는 컬럼이 이미 `vector(1024)`면 건너뛰는 idempotency guard가 있지만,
> **처음 007을 적용하는 배포에서만** 아래 재임베딩 절차를 실행하고, 이후 재배포에서는
> for 루프를 다시 돌리더라도 재임베딩을 다시 실행할 필요가 없는지(=007이 이미 스킵됐는지)
> 로그의 `NOTICE`를 확인할 것.

**007 적용 후 반드시 재임베딩을 실행할 것(최초 1회만).** 007은 컬럼 타입만 바꾸고 기존
임베딩 값은 NULL로 비운다(차원이 달라 기존 벡터를 그대로 옮길 수 없음) — 재임베딩 없이는
`document_chunks` 검색이 전부 빈 결과를 반환한다.

```bash
cd work-flow/App/backend_fastapi
python -m llm_rag_assistant.scripts.reembed_document_chunks
```

> ⚠️ **011 최초 적용 시 배포 순서 주의:** 011은 `users.field`를 `field_legacy_removed`로
> 이름만 바꿔 보관한다(진짜 `DROP` 아님, 문제 생기면 `RENAME COLUMN field_legacy_removed TO
> field`로 즉시 원복 가능). 006/010처럼 재배포 때마다 다시 실행돼도 안전하도록 idempotent하게
> 작성돼 있지만, **처음으로 실제 rename이 일어나는 그 배포 순간만큼은** 옛 컬럼명 `field`를
> 참조하는 구버전 인스턴스가 아직 떠 있으면 그 인스턴스는 즉시 오류를 낸다. 현재 OCI 배포는
> 단일 컨테이너(`docker compose up -d --build`가 컨테이너를 통째로 교체)라 신·구 인스턴스가
> 동시에 DB에 붙어있는 시간이 짧지만, 향후 다중 인스턴스로 확장하면 반드시 모든 인스턴스가
> 새 코드로 교체된 뒤에 이 for 루프를 돌릴 것.
>
> 만약 rename 이후 구버전으로 **롤백**했다가(006이 for 루프에서 재실행되며 `field` 컬럼이
> 다시 생겨 구버전이 정상적으로 값을 기록할 수 있게 됨) 다시 신버전으로 재배포하면, 011은
> 그 `field`를 그냥 지우지 않는다 — 값이 하나라도 남아있으면 자동으로 `field_needs_manual_review`
> 컬럼으로 옮겨 보관하고 Postgres 로그에 `WARNING`을 남긴다. 이 컬럼이 보이면 롤백 기간에
> 실제로 쓰인 데이터가 있다는 뜻이므로, `field_tags`로 수동 병합할지 검토한 뒤 정리할 것 —
> 자동으로는 절대 삭제하지 않는다.

## 9. 검증

```bash
curl -I  https://<도메인>/                      # 200, 인증서 유효
curl -fsS https://<도메인>/api/v1/health        # 200

# 아래는 전부 실패(404)해야 정상 — prod 프로필이 걸렸다는 뜻
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/api/v1/auth/dev-login/1
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/swagger-ui/index.html

# 외부에서 내부 포트가 안 보여야 정상 (전부 타임아웃/거부)
nc -zv <도메인> 5432
nc -zv <도메인> 8080
```

브라우저에서 구글 로그인 → 보드 진입까지 확인한다.

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
