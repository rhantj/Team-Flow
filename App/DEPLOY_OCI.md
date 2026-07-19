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
`docs/db/migrations/001~004`는 **수동으로 적용해야 한다.**

init 스크립트는 `document_chunks.embedding`을 JSONB로 만들고, 마이그레이션 001이 이걸
`VECTOR(768)`로 바꾼다. 001을 건너뛰면 임베딩 기능이 나중에 깨진다.

```bash
cd work-flow
for f in docs/db/migrations/0*.sql; do
  echo "적용: $f"
  docker exec -i workflow-db psql -U postgres -d workflow < "$f"
done
```

> 두 디렉터리를 합칠 수 없는 이유: `docker-entrypoint-initdb.d`는 알파벳순으로 실행하는데
> `001_`이 `01_`보다 앞서서 순서가 뒤집힌다.

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
