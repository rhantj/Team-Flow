# OCI 배포 트러블슈팅 — 인증서 발급 및 첫 실배포

작성일: 2026-07-20

대상 서버: `workflow-ai-oci` (161.33.132.66), 도메인: `t3-workflow-ai.duckdns.org`

[2026-07-17-oci-deployment-runbook.md](2026-07-17-oci-deployment-runbook.md)의 절차([DEPLOY_OCI.md](../App/DEPLOY_OCI.md))를
실제로 따라가며 처음 배포하는 과정에서 발생한 문제 3건과 원인·조치를 기록한다.

---

## 1. 443 포트 연결 안 됨 — certbot 인증서 계보 충돌

### 증상
`STAGING=1`로 스테이징 시험 발급 성공 후, `sudo rm -rf /etc/letsencrypt/live/<도메인>`만 지우고
운영(STAGING 없이) 재발급을 실행. 스크립트는 "완료" 메시지까지 정상 출력했지만
`curl https://<도메인>/`이 443 연결 자체가 안 됨(`Failed to connect`).

### 원인
`rm -rf`로 `live/<도메인>`만 지우고 `archive/<도메인>`, `renewal/<도메인>.conf`는 그대로 남겨둔 상태로
운영 재발급을 실행하면, certbot이 스테이징 때 만든 기존 계보와 충돌을 피하려고
`<도메인>-0001` 접미사를 붙인 **새 인증서 계보**를 만든다. `init-letsencrypt.sh`는 접미사 없는
고정 경로(`live/<도메인>`)로 `live/current` 심볼릭 링크를 걸기 때문에, 실제 발급된 인증서
(`live/<도메인>-0001`)를 가리키지 못하고 존재하지 않는 경로를 가리키게 됐다. nginx는 그 경로에서
`fullchain.pem`을 못 읽어 기동에 계속 실패하며 crash loop.

**증거 체인**: `docker compose ps`에서 `workflow-frontend`만 `Restarting` → nginx 로그에
`cannot load certificate .../live/current/fullchain.pem: No such file` → `ls -la /etc/letsencrypt/live/`
확인 시 `current -> live/<도메인>`인데 정작 `<도메인>-0001`만 존재 → `openssl x509`로 `-0001` 인증서가
`issuer=Let's Encrypt`(진짜, 스테이징 아님), `subject=<도메인>` 일치 확인.

### 조치
```bash
sudo ln -sfn /etc/letsencrypt/live/t3-workflow-ai.duckdns.org-0001 /etc/letsencrypt/live/current
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart frontend
```

### 재발 방지 (TODO)
- `renewal/t3-workflow-ai.duckdns.org.conf`가 여전히 존재하지 않는 원래 경로를 갱신 대상으로 잡고 있을
  가능성 있음 — certbot 자동 갱신(12시간 주기)이 이 계보에서 정상 동작하는지 추후 확인 필요.
- 스테이징 → 운영 전환 시 `rm -rf live/<도메인>`뿐 아니라 `archive/<도메인>`, `renewal/<도메인>.conf`까지
  함께 지우거나, 처음부터 `certbot delete --cert-name <도메인>`으로 계보 자체를 정리하는 편이 안전.
  `init-letsencrypt.sh` 또는 `DEPLOY_OCI.md`에 이 주의사항 반영 권장.

---

## 2. `dev-login`이 운영에서 그대로 열려 있었음 (실제 보안 이슈)

### 증상
검증 단계에서 `curl .../api/v1/auth/dev-login/1`이 404가 아니라 **302**(정상 로그인 리다이렉트) 반환.
즉 데모 계정으로 인증 없이 로그인이 가능한 상태로 인터넷에 노출됨.

### 원인
`application-prod.yml`은 `dev-login-enabled: ${WORKFLOW_DEMO_DEV_LOGIN_ENABLED:false}`로
운영 기본값을 false로 두려 했지만, **`docker-compose.yml`(base, dev/prod 공용)이 이미
`WORKFLOW_DEMO_DEV_LOGIN_ENABLED: ${WORKFLOW_DEMO_DEV_LOGIN_ENABLED:-true}`로 컨테이너 OS
환경변수 자체에 `true`를 주입**한다. `.env.example`에는 이 변수가 아예 없어서, `.env`를
그대로 복사해 쓰면 실제 환경변수 값이 이미 `true`로 존재하게 되고, YAML의 `:false` 기본값은
애초에 적용될 기회가 없다. `SPRING_PROFILES_ACTIVE=prod`가 정상 적용돼도(로그로 확인됨)
이 특정 값은 프로필과 무관하게 뚫려 있었다.

이 위험은 [2026-07-17 런북](2026-07-17-oci-deployment-runbook.md) 0장에서 "compose에
`SPRING_PROFILES_ACTIVE`가 없다"는 형태로 이미 한 번 지적됐었는데, 이후 `SPRING_PROFILES_ACTIVE=prod`
자체는 `docker-compose.prod.yml`에 반영됐지만(커밋 `4437024`) `WORKFLOW_DEMO_DEV_LOGIN_ENABLED`
env var의 기본값 충돌까지는 잡히지 않고 넘어갔다.

### 조치
`.env`에 명시적으로 추가:
```bash
WORKFLOW_DEMO_DEV_LOGIN_ENABLED=false
WORKFLOW_DEMO_SEED_ENABLED=false
```
코드 변경이 아니므로 재빌드 없이 컨테이너만 재생성:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend-spring
```
재확인: `dev-login/1` → 404 정상 반환 확인.

### 재발 방지 (TODO)
- `.env.example`에 `WORKFLOW_DEMO_DEV_LOGIN_ENABLED`, `WORKFLOW_DEMO_SEED_ENABLED`를
  운영 기본값(false)과 함께 명시하고, [DEPLOY_OCI.md](../App/DEPLOY_OCI.md) 5단계
  "반드시 바꿀 값" 목록에 추가 권장.
- 근본적으로는 `docker-compose.yml`(base)의 `:-true` 기본값이 `application.yml`(dev 기본값)과
  중복되는 위험한 이중 기본값 구조 — base compose에서는 이 값을 아예 안 넘기고 Spring
  프로필의 기본값에만 맡기는 것도 고려할 만함.

---

## 3. swagger/`v3/api-docs` 200 — 실제 취약점 아닌 오탐

### 증상
`curl .../swagger-ui/index.html`, `curl .../v3/api-docs` 둘 다 200 반환 (검증 스크립트 기준 실패).

### 원인 조사
`application-prod.yml`은 `springdoc.api-docs.enabled: false`, `springdoc.swagger-ui.enabled: false`로
명시적으로 disable. jar 안에 `application-prod.yml`이 실제 포함됐는지도 `docker cp` +
`python3 zipfile`로 직접 확인 — 정상 포함.

진짜 원인은 nginx 쪽: [nginx.prod.conf](../App/frontend/nginx.prod.conf)는 `/api/`로 시작하는
경로만 `backend-spring`으로 프록시하고, 나머지는 전부 SPA catch-all(`try_files $uri /index.html`)로
떨어진다. `/swagger-ui/`, `/v3/api-docs`는 `/api/` 프리픽스가 아니므로 **백엔드에 도달조차 안 하고
프론트 `index.html`이 그대로 반환**된 것. 응답의 `content-length`가 루트(`/`)와 완전히 동일(791바이트)한
것으로 확정.

### 결론
실제 노출 취약점이 아님 — 조치 불필요. 다만 [DEPLOY_OCI.md](../App/DEPLOY_OCI.md) 9장의 검증 항목은
이 nginx 구조에서는 "springdoc이 꺼졌는지"를 실제로 검증하지 못하는 형태이므로, 문서 표현을
"이 경로들은 nginx가애초에 백엔드로 프록시하지 않아 200이 나오는 게 정상"으로 보완하면 좋겠음.

---

## 최종 검증 상태 (이 세션 종료 시점)

| 항목 | 상태 |
|---|---|
| DNS 연결 | ✅ |
| 인증서 발급/443 | ✅ (계보 충돌 수정 후) |
| DB 마이그레이션 (001~004) | ✅ |
| `/api/v1/health` | ✅ 200 |
| `dev-login` 차단 | ✅ 404 (수정 후) |
| swagger/api-docs 200 | ✅ 문제 아님 (nginx 미프록시) |
| DB/백엔드 포트 외부 미노출 | 미확인 — `nc -zv <도메인> 5432/8080` 필요 |
| 구글 로그인 → 보드 진입 (브라우저) | 미확인 |
