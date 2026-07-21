# OCI 배포 런북 및 적용 코드

작성일: 2026-07-17

설계 배경과 결정 근거는 [superpowers/specs/2026-07-17-oci-deployment-design.md](superpowers/specs/2026-07-17-oci-deployment-design.md) 참고.

이 문서는 **아직 코드베이스에 반영되지 않은 상태**다. 아래 코드는 검증까지 마쳤으나
팀 검토 후 별도 PR로 반영할 것.

대상 서버: `workflow-ai-oci` (161.33.132.66, Ubuntu 24.04 ARM, 2 OCPU / 12GB)

이번 배포에서 **Ollama(로컬 LLM)는 제외**한다. RAG 검색/생성은 동작하지 않고,
회의 분석은 Spring의 `FallbackMeetingAnalyzer`가 대신 처리한다. 앱은 정상 동작한다.

---

## 0. 왜 이 변경이 필요한가 (반영 전 반드시 읽을 것)

### 포트 노출 — 지금 그대로 배포하면 DB가 인터넷에 열린다

현재 `docker-compose.yml`은 db·redis·kafka·spring·fastapi를 전부 `0.0.0.0`에 게시한다.
`POSTGRES_PASSWORD` 기본값이 `root`이므로 그대로 배포하면 사고다.

**호스트 iptables로는 못 막는다.** Docker는 publish한 포트를 nat PREROUTING + FORWARD
체인으로 처리하므로 INPUT 체인 규칙을 우회한다. 포트를 게시하지 않는 것이 유일한 방어다.

### Spring 프로필 — 지금 그대로면 로그인 우회로가 열린다

`application-prod.yml`에서만 `dev-login-enabled: false`, `seed-enabled: false`,
springdoc 비활성화가 적용된다. `application.yml`의 기본값은 `dev-login-enabled: **true**`다.
compose에 `SPRING_PROFILES_ACTIVE`가 없으므로 그대로 배포하면
`/api/v1/auth/dev-login/{1~4}`가 인터넷에 열려 **누구나 데모 계정으로 로그인**할 수 있다.

### pgvector — 마이그레이션이 실패한다

`docs/db/migrations/001_document_chunks_vector.sql`이 `CREATE EXTENSION vector`를 쓴다.
Supabase는 pgvector 내장이지만 `postgres:17` 공식 이미지에는 없다.

### X-Forwarded-Proto — 구글 로그인이 깨진다

TLS를 nginx에서 종료하므로 Spring은 평문 HTTP로 받는다. 헤더가 없으면 Spring이
리다이렉트 URL을 `http://`로 만들어 OAuth 흐름이 끊긴다.

---

## 1. 도메인 준비

구글 OAuth는 리디렉션 URI에 **HTTPS와 실제 도메인을 강제**한다. 생 IP(`161.33.132.66`)는
HTTP라서 한 번, IP라서 또 한 번 거부된다. 구글 공식 문서 기준:

> "Redirect URIs must use the HTTPS scheme, not plain HTTP."
> "Hosts cannot be raw IP addresses."

둘 다 localhost만 예외다. 따라서 도메인이 반드시 필요하다.
[DuckDNS](https://www.duckdns.org) 등에서 무료 서브도메인을 받아 `161.33.132.66`에 연결한다.

```bash
dig +short <도메인>     # 161.33.132.66 이 나와야 함
```

## 2. OCI Security List에 80/443 열기

콘솔 → 인스턴스 → VCN(`workflow-vcn`) → 서브넷 → 보안 목록 → 수신 규칙 추가.
기본은 22만 열려 있다.

| 소스 CIDR | 프로토콜 | 대상 포트 |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

## 3. 서버 iptables 열기

**OCI Ubuntu 이미지는 22를 제외한 모든 포트를 iptables로 차단한다.** 2번만 하고
여기서 막히는 게 OCI의 대표적 함정이다.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save     # 재부팅 후에도 유지
```

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

`docker compose version`이 **v2.24 이상**이어야 한다. 아래 오버레이가 쓰는 `!override`
태그가 그 버전부터 지원된다.

## 5. .env 작성

```bash
git clone https://github.com/rhantj/work-flow.git
cd work-flow/App
cp .env.example .env
```

반드시 바꿀 값:

```bash
POSTGRES_PASSWORD=<길고 무작위한 값>          # 기본값 root 절대 금지
JWT_SECRET=<32바이트 이상 무작위 문자열>
GOOGLE_CLIENT_ID=<구글 콘솔 값>
GOOGLE_CLIENT_SECRET=<구글 콘솔 값>
GOOGLE_REDIRECT_URI=https://<도메인>/api/v1/auth/google/callback
WORKFLOW_FRONTEND_BASE_URL=https://<도메인>
WORKFLOW_CORS_ORIGINS=https://<도메인>
```

무작위 값 생성: `openssl rand -base64 36`

## 6. 구글 콘솔에 리디렉션 URI 등록

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 클라이언트 ID →
**승인된 리디렉션 URI**에 아래 추가. `.env`의 `GOOGLE_REDIRECT_URI`와 한 글자도 다르면 안 된다.

```
https://<도메인>/api/v1/auth/google/callback
```

## 7. 인증서 발급 + 기동

```bash
cd work-flow/App
DOMAIN=<도메인> EMAIL=<이메일> bash scripts/init-letsencrypt.sh
```

처음이라면 `STAGING=1`로 시험 발급을 먼저 할 것. Let's Encrypt는 운영 환경에서
**주당 5회 실패 제한**이 있어, 설정이 틀린 채로 반복하면 일주일간 막힌다.

이후 배포는 한 줄이다:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

첫 빌드는 2 OCPU에서 **10~20분** 걸린다 (Gradle + pnpm + pip).

## 8. DB 마이그레이션 적용 (첫 기동 후 1회)

compose는 `backend_spring/src/main/resources/db/init`만 자동 실행한다.
`docs/db/migrations/001~004`는 **수동 적용해야 한다.** init은
`document_chunks.embedding`을 JSONB로 만들고 001이 `VECTOR(768)`로 바꾼다.

```bash
cd work-flow
for f in docs/db/migrations/0*.sql; do
  echo "적용: $f"
  docker exec -i workflow-db psql -U postgres -d workflow < "$f"
done
```

> 두 디렉터리를 합칠 수 없는 이유: `docker-entrypoint-initdb.d`는 알파벳순 실행인데
> `001_`이 `01_`보다 앞서서 순서가 뒤집힌다.

## 9. 검증

```bash
curl -I  https://<도메인>/                      # 200, 인증서 유효
curl -fsS https://<도메인>/api/v1/health        # 200

# 아래는 전부 404여야 정상 — prod 프로필이 걸렸다는 뜻
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/api/v1/auth/dev-login/1
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/swagger-ui/index.html

# 외부에서 내부 포트가 안 보여야 정상
nc -zv <도메인> 5432
nc -zv <도메인> 8080
```

브라우저에서 구글 로그인 → 보드 진입까지 확인한다.

---

# 적용할 코드

## 신규: `App/docker-compose.prod.yml`

```yaml
# 운영(OCI) 오버레이. docker-compose.yml 위에 얹어서 사용한다.
#
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
#
# 로컬 개발은 이 파일 없이 `docker compose up`을 그대로 쓴다.
#
# !override 태그는 병합 대신 교체를 지시한다 (Compose v2.24+). 이게 없으면 base의
# ports가 append돼서 0.0.0.0 게시가 그대로 남는다.
services:
  db:
    # 공식 postgres:17에는 pgvector가 없다. docs/db/migrations/001이 CREATE EXTENSION vector를
    # 쓰므로 확장이 포함된 이미지가 필요하다.
    image: pgvector/pgvector:pg17
    restart: unless-stopped
    # 호스트에 게시하지 않는다. 외부에서 봐야 하면 SSH 터널을 쓴다:
    #   ssh -i ~/.ssh/oci_workflow_key -L 5432:localhost:5432 ubuntu@161.33.132.66
    ports: !override
      - '127.0.0.1:5432:5432'

  redis:
    restart: unless-stopped
    ports: !override
      - '127.0.0.1:6379:6379'

  kafka:
    restart: unless-stopped
    ports: !override
      - '127.0.0.1:9092:9092'

  backend-spring:
    restart: unless-stopped
    environment:
      # application-prod.yml을 활성화한다. 이게 없으면 dev 프로필로 떠서
      # /api/v1/auth/dev-login/{1~4}와 Swagger가 인터넷에 열린다.
      SPRING_PROFILES_ACTIVE: prod
      # nginx가 TLS를 종료하므로 Spring은 평문으로 받는다. 이 설정이 있어야
      # X-Forwarded-Proto를 보고 리다이렉트 URL을 https로 만든다.
      SERVER_FORWARD_HEADERS_STRATEGY: framework
    ports: !override
      - '127.0.0.1:8080:8080'

  backend-fastapi:
    restart: unless-stopped
    # Ollama는 이번 배포 범위에서 제외한다. OLLAMA_HOST가 도달 불가여도
    # chat_router가 ConnectError를 잡아 에러 응답을 내므로 앱은 죽지 않는다.
    ports: !override
      - '127.0.0.1:8000:8000'

  frontend:
    restart: unless-stopped
    volumes:
      # 운영용 nginx 설정으로 교체 (80/443 + ACME + TLS)
      - ./frontend/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
      # /etc/letsencrypt 전체를 마운트해야 live/ 안의 상대 심볼릭 링크가
      # archive/로 제대로 풀린다. 일부만 마운트하면 링크가 깨진다.
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - certbot-webroot:/var/www/certbot:ro
    ports: !override
      - '80:80'
      - '443:443'
    # 6시간마다 reload해서 certbot이 갱신한 인증서를 집어올린다.
    # (nginx는 재시작 없이 reload만으로 새 인증서를 읽는다)
    command: >
      sh -c 'while :; do sleep 6h & wait $${!}; nginx -s reload; done &
      nginx -g "daemon off;"'

  # 인증서 자동 갱신. 12시간마다 깨어나 만료 30일 이내면 갱신한다.
  # 최초 발급은 scripts/init-letsencrypt.sh가 담당한다.
  certbot:
    image: certbot/certbot:latest
    container_name: workflow-certbot
    restart: unless-stopped
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt
      - certbot-webroot:/var/www/certbot
    entrypoint: >
      sh -c 'trap exit TERM;
      while :; do
        certbot renew --webroot -w /var/www/certbot --quiet;
        sleep 12h & wait $${!};
      done'

volumes:
  certbot-webroot:
```

## 신규: `App/frontend/nginx.prod.conf`

고무서님이 만든 `nginx.conf`(로컬 개발용, 5173/HTTP)는 그대로 두고 별도 파일로 둔다.
운영에서는 오버레이가 이 파일을 `default.conf` 자리에 bind-mount 한다.

```nginx
# 운영(OCI)용 nginx 설정. docker-compose.prod.yml이 이 파일을
# /etc/nginx/conf.d/default.conf 자리에 bind-mount 한다.
# 로컬 개발은 nginx.conf(5173, HTTP)를 그대로 쓴다.
#
# 인증서 경로에 도메인이 안 들어가는 이유: 호스트에서
#   /etc/letsencrypt/live/current -> /etc/letsencrypt/live/<도메인>
# 심볼릭 링크를 만들어 두기 때문이다 (scripts/init-letsencrypt.sh가 생성).
# 덕분에 이 파일은 도메인을 몰라도 되고, 도메인이 바뀌어도 링크만 다시 걸면 된다.

server {
    listen 80;
    server_name _;

    # ACME 챌린지는 HTTPS로 리다이렉트하면 안 된다. certbot이 평문 80으로 검증한다.
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name _;

    ssl_certificate     /etc/letsencrypt/live/current/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/current/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;

    root /usr/share/nginx/html;
    index index.html;

    # compose 내부 DNS. 재시작으로 IP가 바뀌어도 따라가도록 변수로 둔다.
    resolver 127.0.0.11 valid=10s;

    # 회의록 오디오/문서 업로드가 있어 기본값(1m)으로는 막힌다.
    # Spring의 multipart max-request-size(120MB)에 맞춘다.
    client_max_body_size 120M;

    location /api/ {
        set $backend_upstream backend-spring:8080;
        proxy_pass http://$backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # 이게 없으면 Spring이 OAuth 리다이렉트 URL을 http://로 만들어 로그인이 깨진다.
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

## 신규: `App/scripts/init-letsencrypt.sh`

```bash
#!/usr/bin/env bash
# Let's Encrypt 인증서 최초 발급 (OCI 서버에서 1회만 실행).
# 갱신은 docker-compose.prod.yml의 certbot 컨테이너가 알아서 한다.
#
# 사용법:
#   cd App
#   DOMAIN=myapp.duckdns.org EMAIL=you@example.com bash scripts/init-letsencrypt.sh
#
# 순환 문제를 푸는 방식:
#   nginx는 인증서 파일이 있어야 443으로 뜨는데, certbot은 nginx가 80에서 챌린지를
#   서빙해야 인증서를 준다. 그래서 임시 자체서명 인증서로 nginx를 먼저 띄우고,
#   진짜 인증서를 받은 뒤 교체한다.

set -euo pipefail

: "${DOMAIN:?DOMAIN 환경변수가 필요하다 (예: DOMAIN=myapp.duckdns.org)}"
: "${EMAIL:?EMAIL 환경변수가 필요하다 (만료 알림 수신용)}"

# 스테이징으로 먼저 시험하려면 STAGING=1. Let's Encrypt 운영 환경은 실패 횟수 제한이
# 빡빡하므로(주당 5회) 설정이 확실하지 않으면 스테이징을 먼저 쓸 것.
STAGING="${STAGING:-0}"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"

echo "==> 도메인: ${DOMAIN}"

if [ -e "${LIVE_DIR}/fullchain.pem" ] && [ ! -L "${LIVE_DIR}/fullchain.pem.dummy" ]; then
  echo "이미 인증서가 있다: ${LIVE_DIR}"
  echo "다시 발급하려면 sudo rm -rf ${LIVE_DIR} 후 재실행."
  exit 0
fi

echo "==> 1/5 임시 자체서명 인증서 생성 (nginx 부트스트랩용)"
sudo mkdir -p "${LIVE_DIR}"
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "${LIVE_DIR}/privkey.pem" \
  -out "${LIVE_DIR}/fullchain.pem" \
  -subj "/CN=localhost"

echo "==> 2/5 live/current 심볼릭 링크 생성"
# nginx.prod.conf가 도메인을 모르게 하려고 고정 경로를 쓴다.
sudo ln -sfn "${LIVE_DIR}" /etc/letsencrypt/live/current

echo "==> 3/5 nginx 기동 (80에서 ACME 챌린지 서빙)"
${COMPOSE} up -d --build frontend

# nginx가 80을 잡을 때까지 잠깐 기다린다.
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null "http://localhost/.well-known/acme-challenge/" 2>/dev/null; then break; fi
  sleep 1
done

echo "==> 4/5 임시 인증서 삭제 후 진짜 인증서 발급"
sudo rm -rf "${LIVE_DIR}"

STAGING_FLAG=""
if [ "${STAGING}" != "0" ]; then
  echo "    (스테이징 모드 — 브라우저가 신뢰하지 않는 인증서가 발급된다)"
  STAGING_FLAG="--staging"
fi

${COMPOSE} run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  ${STAGING_FLAG} \
  -d "${DOMAIN}" \
  --email "${EMAIL}" \
  --agree-tos --no-eff-email \
  --non-interactive

# 발급 후 live 디렉터리가 새로 만들어졌으므로 링크를 다시 건다.
sudo ln -sfn "${LIVE_DIR}" /etc/letsencrypt/live/current

echo "==> 5/5 전체 스택 기동"
${COMPOSE} up -d --build

echo
echo "완료. https://${DOMAIN} 확인."
echo "인증서 갱신은 certbot 컨테이너가 12시간마다 확인하고,"
echo "nginx는 6시간마다 reload해서 갱신분을 집어온다."
```

## 수정: `App/backend_spring/src/main/resources/application.yml`

```yaml
server:
  port: ${PORT:8080}
  address: 0.0.0.0
  # nginx 뒤에서 TLS가 종료되는 배포 환경에서는 framework로 켠다(docker-compose.prod.yml).
  # 켜지 않으면 X-Forwarded-Proto를 무시하고 리다이렉트 URL을 http://로 만들어 OAuth가 깨진다.
  forward-headers-strategy: ${SERVER_FORWARD_HEADERS_STRATEGY:none}
```

기본값 `none`이라 로컬 개발 동작은 그대로다.

## 수정: `App/docker-compose.yml` — frontend 잔재 정리

`43c8a50`(고무서)이 Dockerfile을 nginx 멀티스테이지로 바꿨으나 compose를 안 고쳐서
`./frontend:/app` 볼륨과 `API_PROXY_TARGET`이 남아 있다. nginx 이미지는
`/usr/share/nginx/html`을 서빙하므로 둘 다 무의미하고, **HMR은 이미 동작하지 않는데
주석은 HMR이라고 말한다.**

```yaml
  frontend:
    # Dockerfile이 pnpm build 결과를 nginx(1.27-alpine)에 얹어 5173으로 서빙하고
    # /api/는 backend-spring:8080으로 프록시한다 (frontend/nginx.conf).
    # 정적 빌드라 HMR은 동작하지 않는다 — 프론트를 고치며 개발할 땐 이 컨테이너 대신
    # 호스트에서 `cd frontend && pnpm dev`를 쓸 것.
    build: ./frontend
    container_name: workflow-frontend
    ports:
      - '5173:5173'
    depends_on:
      - backend-spring
```

---

## 검증 기록 (2026-07-17)

로컬에서 실제로 확인한 것:

**포트 격리** — 오버레이 병합 결과(`docker compose config`)에서 확인:

```
db / redis / kafka / backend-spring / backend-fastapi  →  host_ip: 127.0.0.1
frontend                                               →  80, 443 (공개)
```

`!override`가 의도대로 동작해 base의 `5173`과 `0.0.0.0` 게시가 전부 교체됨.
`image: pgvector/pgvector:pg17`, `SPRING_PROFILES_ACTIVE: prod`,
`SERVER_FORWARD_HEADERS_STRATEGY: framework`도 병합 결과에서 확인.

**nginx 문법** — 더미 인증서를 만들어 `nginx:1.27-alpine`으로 `nginx -t` 통과.

**ARM64 이미지 지원** — Docker Hub 조회 결과 전부 arm64 지원:
postgres:17, pgvector/pgvector:pg17, apache/kafka:3.8.0, redis:7-alpine, nginx:1.27-alpine.

**로컬 개발 영향 없음** — 오버레이 없이 `docker compose config` 정상 파싱.

### 아직 검증하지 못한 것

- **`live/current` 심볼릭 링크 방식** — 논리적으로는 맞으나(전체 `/etc/letsencrypt`를
  마운트해야 `live→archive` 상대 링크가 풀림) 실제 certbot 발급 후 동작은 서버 확인 필요.
  Windows에서는 심볼릭 링크 테스트 불가.
- **`init-letsencrypt.sh` 실행** — `bash -n` 문법 검사만 했고 실행은 못 함.
  그래서 `STAGING=1` 선행을 권함.
- **ARM 빌드** — 이미지 arm64 지원은 확인했으나 실제 Gradle/pnpm 빌드는 서버에서 확인 필요.

## 문제 해결

**80/443이 안 열린다** — 2번(Security List)과 3번(iptables)을 **둘 다** 했는지 확인.
`sudo iptables -L INPUT -n --line-numbers`로 규칙 확인.

**구글 로그인이 `redirect_uri_mismatch`** — `.env`의 `GOOGLE_REDIRECT_URI`와 구글 콘솔
등록 값이 정확히 같아야 한다. 끝의 슬래시 하나도 다르면 안 된다.

**로그인 후 http://로 튕긴다** — `SERVER_FORWARD_HEADERS_STRATEGY=framework`와
nginx의 `X-Forwarded-Proto` 둘 다 확인.

**빌드 중 OOM** — 12GB면 충분하지만 실행 중인 스택과 빌드가 겹치면 빠듯할 수 있다.
`docker compose ... down` 후 빌드하거나 스왑을 임시로 추가.
